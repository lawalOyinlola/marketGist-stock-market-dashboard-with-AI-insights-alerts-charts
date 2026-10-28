"use server";

import type { ObjectId } from "mongodb";
import { connectToDatabase } from "@/database/mongoose";
import { Alert } from "@/database/models/alert.model";
import { Notification } from "@/database/models/notification.model";
import { inngest } from "@/lib/inngest/client";
import { getQuote } from "@/lib/actions/finnhub.actions";

export interface TriggeredAlert {
  alertId: string;
  userId: string;
  symbol: string;
  company: string;
  alertType: "upper" | "lower";
  threshold: number;
  currentPrice: number;
}

/**
 * Check all active alerts and trigger ones that hit their thresholds
 * Returns the list of triggered alerts
 */
export async function checkAlertsAndTrigger(): Promise<{
  triggered: TriggeredAlert[];
  errors: string[];
}> {
  const triggered: TriggeredAlert[] = [];
  const errors: string[] = [];

  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not found");

    // Get all active alerts
    const alerts = await Alert.find({ isActive: true }).lean();

    console.log(`Checking ${alerts.length} active alerts...`);

    // Group alerts by symbol to minimize API calls
    const symbolsMap = new Map<string, (typeof alerts)[number][]>();
    for (const alert of alerts) {
      const symbol = alert.symbol;
      if (!symbolsMap.has(symbol)) {
        symbolsMap.set(symbol, []);
      }
      symbolsMap.get(symbol)!.push(alert);
    }

    // Process symbols in batches to prevent overwhelming API/database
    const batchSize = 10;
    const symbolsArray = Array.from(symbolsMap.entries());

    for (let i = 0; i < symbolsArray.length; i += batchSize) {
      const batch = symbolsArray.slice(i, i + batchSize);

      // Process batch concurrently
      await Promise.all(
        batch.map(async ([symbol, symbolAlerts]) => {
          try {
            // Get current price for this symbol
            const quote = await getQuote(symbol);
            if (
              !quote ||
              typeof quote.c !== "number" ||
              !Number.isFinite(quote.c)
            ) {
              errors.push(`No price data available for ${symbol}`);
              return;
            }

            const currentPrice = quote.c;

            // Check each alert for this symbol
            for (const alert of symbolAlerts) {
              try {
                const shouldTrigger =
                  alert.alertType === "upper"
                    ? currentPrice >= alert.threshold
                    : currentPrice <= alert.threshold;

                if (shouldTrigger) {
                  // Use atomic database operation to check and update frequency constraints
                  // This prevents race conditions by making DB the single source of truth
                  const now = new Date();
                  const lastTriggered = alert.lastTriggeredAt
                    ? new Date(alert.lastTriggeredAt)
                    : null;
                  let updateResult: { modifiedCount: number };

                  if (alert.frequency === "once") {
                    // Atomically check isActive and deactivate
                    updateResult = await Alert.updateOne(
                      { _id: alert._id, isActive: true },
                      { $set: { isActive: false, lastTriggeredAt: now } }
                    );
                  } else {
                    // Pre-check time window before attempting update
                    if (lastTriggered) {
                      const timeSinceLastTrigger =
                        now.getTime() - lastTriggered.getTime();
                      let minTimeWindow = 0;

                      switch (alert.frequency) {
                        case "hourly":
                          minTimeWindow = 60 * 60 * 1000;
                          break;
                        case "daily":
                          minTimeWindow = 24 * 60 * 60 * 1000;
                          break;
                        default:
                          console.error(
                            `Unknown frequency: ${alert.frequency}, defaulting to daily`
                          );
                          minTimeWindow = 24 * 60 * 60 * 1000;
                          break;
                      }

                      if (timeSinceLastTrigger < minTimeWindow) {
                        console.log(
                          `Alert ${
                            alert.alertName || alert._id
                          } (${symbol}) skipping due to frequency constraint (${
                            alert.frequency
                          })`
                        );
                        continue;
                      }
                    }

                    // Atomically update with optimistic concurrency control
                    updateResult = await Alert.updateOne(
                      {
                        _id: alert._id,
                        isActive: true,
                        $or: [
                          { lastTriggeredAt: { $exists: false } },
                          { lastTriggeredAt: lastTriggered },
                        ],
                      },
                      { $set: { lastTriggeredAt: now } }
                    );
                  }

                  // Only proceed if DB update actually modified a document
                  if (updateResult.modifiedCount === 0) {
                    console.log(
                      `Alert ${
                        alert.alertName || alert._id
                      } (${symbol}) skipped - already triggered by another process`
                    );
                    continue;
                  }

                  console.log(
                    `Alert triggered: ${symbol} - ${alert.alertType} threshold ${alert.threshold}, current: ${currentPrice}, frequency: ${alert.frequency}`
                  );

                  // Get user email - fetch the exact user by app id, then fallback to Mongo _id
                  let user = await db
                    .collection("user")
                    .findOne<{ _id?: unknown; id?: string; email?: string }>({
                      id: alert.userId,
                    });

                  let userEmail: string;

                  if (user) {
                    // Authenticated user - use their email
                    userEmail = user.email || "";
                  } else {
                    // Check if it's a guest user (userId is email)
                    // Try to look up by _id first
                    try {
                      const maybeObjectId = new mongoose.Types.ObjectId(alert.userId);
                      user = await db.collection("user").findOne<{
                        _id?: unknown;
                        id?: string;
                        email?: string;
                      }>({
                        _id: maybeObjectId,
                      });

                      if (user) {
                        userEmail = user.email || "";
                      } else {
                        // Assume it's a guest userId (email)
                        userEmail = alert.userId;
                      }
                    } catch (_) {
                      // Non-ObjectId userId; could be guest email or string _id
                      user = await db.collection("user").findOne<{
                        _id?: unknown;
                        id?: string;
                        email?: string;
                      }>({
                        _id: alert.userId as unknown as ObjectId,
                      });

                      if (user) {
                        userEmail = user.email || "";
                      } else {
                        // Assume it's a guest userId (email)
                        userEmail = alert.userId;
                      }
                    }
                  }

                  if (!userEmail) {
                    errors.push(`No email found for user ${alert.userId}`);
                    continue;
                  }

                  // Get company name (could be from a profile lookup, but let's use the alert's company field)
                  const company = alert.company || symbol;

                  const targetPrice = alert.threshold;
                  const timestamp = new Date();
                  const timestampISO = timestamp.toISOString();

                  // Generate deterministic ID for idempotency within a time window
                  // This prevents duplicate alert sends on retries while allowing new alerts next window
                  const eventId = `${alert._id}:${Math.floor(
                    timestamp.getTime() / 60000
                  )}`;

                  // Trigger the appropriate Inngest event
                  if (alert.alertType === "upper") {
                    await inngest.send({
                      id: eventId,
                      name: "app/stock.alert.upper",
                      data: {
                        id: eventId,
                        email: userEmail,
                        symbol,
                        company,
                        currentPrice,
                        targetPrice,
                        timestamp: timestampISO,
                      },
                    });
                  } else {
                    await inngest.send({
                      id: eventId,
                      name: "app/stock.alert.lower",
                      data: {
                        id: eventId,
                        email: userEmail,
                        symbol,
                        company,
                        currentPrice,
                        targetPrice,
                        timestamp: timestampISO,
                      },
                    });
                  }

                  triggered.push({
                    alertId: String(alert._id),
                    userId: alert.userId,
                    symbol,
                    company,
                    alertType: alert.alertType,
                    threshold: alert.threshold,
                    currentPrice,
                  });

                  // Create a notification for the user
                  try {
                    await Notification.create({
                      userId: alert.userId,
                      type: "price_alert",
                      title: `Price Alert: ${symbol} ${
                        alert.alertType === "upper" ? "▲" : "▼"
                      }`,
                      message: `${company} (${symbol}) hit your ${
                        alert.alertType === "upper" ? "upper" : "lower"
                      } target of $${targetPrice}. Current price: $${currentPrice.toFixed(
                        2
                      )}.`,
                      symbol,
                      isRead: false,
                    });
                  } catch (notifError) {
                    console.error("Failed to create notification:", notifError);
                  }

                  // DB update already happened above - DB is the single source of truth
                }
              } catch (alertError) {
                errors.push(
                  `Failed to process alert ${alert._id} for ${symbol}: ${
                    alertError instanceof Error
                      ? alertError.message
                      : "Unknown error"
                  }`
                );
              }
            }
          } catch (error) {
            errors.push(
              `Failed to process alerts for ${symbol}: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        })
      );
    }

    console.log(
      `Alert check complete: ${triggered.length} alerts triggered, ${errors.length} errors`
    );

    return { triggered, errors };
  } catch (error) {
    console.error("Error checking alerts:", error);
    errors.push(
      `Failed to check alerts: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return { triggered, errors };
  }
}
