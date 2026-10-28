"use server";

import { connectToDatabase } from "@/database/mongoose";
import { Alert } from "@/database/models/alert.model";
import { resolveDataOwner } from "@/lib/utils/user-access";
import { checkIpRateLimit } from "@/lib/utils/rate-limit";

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export async function getAlertsByEmail(email: string): Promise<AlertData[]> {
  try {
    // Signed-in callers get their own alerts; guests only for an email
    // that has no account
    const owner = await resolveDataOwner(email);
    if (!owner) return [];

    await connectToDatabase();
    const alerts = await Alert.find({
      userId: owner.userId,
      isActive: true,
    }).lean();
    return alerts.map((alert) => ({
      id: String(alert._id),
      symbol: alert.symbol,
      company: alert.company,
      alertName: alert.alertName,
      alertType: alert.alertType,
      threshold: alert.threshold,
      frequency: alert.frequency,
      lastTriggeredAt: alert.lastTriggeredAt,
    }));
  } catch (err) {
    console.error("getAlertsByEmail error:", err);
    return [];
  }
}

export async function createAlert(
  symbol: string,
  company: string,
  alertName: string,
  alertType: "upper" | "lower",
  threshold: number,
  frequency: "once" | "daily" | "hourly" = "daily",
  guestEmail?: string
): Promise<{ success: boolean; error?: string; alertId?: string }> {
  try {
    // Input validation
    if (!symbol || typeof symbol !== "string") {
      return {
        success: false,
        error: "Symbol is required and must be a string",
      };
    }

    if (
      typeof threshold !== "number" ||
      !Number.isFinite(threshold) ||
      threshold <= 0
    ) {
      return { success: false, error: "Threshold must be a positive number" };
    }

    if (!alertType || !["upper", "lower"].includes(alertType)) {
      return { success: false, error: "Alert type must be 'upper' or 'lower'" };
    }

    if (frequency && !["once", "daily", "hourly"].includes(frequency)) {
      return {
        success: false,
        error: "Frequency must be 'once', 'daily', or 'hourly'",
      };
    }

    // Normalize and sanitize inputs
    const normalizedSymbol = symbol.toUpperCase().trim();
    if (!/^[A-Z0-9.:\-]{1,20}$/.test(normalizedSymbol)) {
      return { success: false, error: "Invalid stock symbol" };
    }

    const sanitizedCompany =
      company && typeof company === "string"
        ? company.trim().substring(0, 100)
        : "";

    const sanitizedAlertName =
      alertName && typeof alertName === "string"
        ? alertName.trim().substring(0, 100)
        : "";

    const { allowed } = await checkIpRateLimit("alert-write", 30, 600);
    if (!allowed) {
      return { success: false, error: "Too many requests. Please slow down." };
    }

    const owner = await resolveDataOwner(guestEmail);
    if (!owner) {
      return { success: false, error: "Please sign in to continue" };
    }
    const { userId } = owner;

    // Check if similar alert already exists
    const existing = await Alert.findOne({
      userId,
      symbol: normalizedSymbol,
      alertType,
      threshold,
      isActive: true,
    });

    if (existing) {
      return { success: false, error: "Similar alert already exists" };
    }

    // Create alert with race condition handling
    try {
      const alert = await Alert.create({
        userId,
        symbol: normalizedSymbol,
        company: sanitizedCompany,
        alertName: sanitizedAlertName,
        alertType,
        threshold,
        frequency,
        isActive: true,
      });

      return { success: true, alertId: alert._id.toString() };
    } catch (createError: unknown) {
      // Handle MongoDB duplicate key errors (race conditions)
      if ((createError as { code?: unknown })?.code === 11000) {
        return { success: false, error: "Similar alert already exists" };
      }
      throw createError;
    }
  } catch (error) {
    console.error("createAlert error:", error);
    return { success: false, error: "Failed to create alert" };
  }
}

export async function removeAlert(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof alertId !== "string" || !OBJECT_ID_PATTERN.test(alertId)) {
      return { success: false, error: "Alert not found" };
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not found");

    // Get current user from auth
    const { getAuth } = await import("@/lib/better-auth/auth");
    const { headers } = await import("next/headers");
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return { success: false, error: "User not authenticated" };
    }

    const userId = session.user.id;

    // Remove alert (soft delete by setting isActive to false)
    const result = await Alert.updateOne(
      { _id: alertId, userId },
      { isActive: false }
    );

    if (result.modifiedCount === 0) {
      return { success: false, error: "Alert not found" };
    }

    return { success: true };
  } catch (error) {
    console.error("removeAlert error:", error);
    return { success: false, error: "Failed to remove alert" };
  }
}

export async function updateAlert(
  alertId: string,
  updates: {
    alertName?: string;
    alertType?: "upper" | "lower";
    threshold?: number;
    frequency?: "once" | "daily" | "hourly";
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Input validation
    if (typeof alertId !== "string" || !OBJECT_ID_PATTERN.test(alertId)) {
      return { success: false, error: "Alert not found" };
    }

    if (!updates || typeof updates !== "object") {
      return { success: false, error: "Updates must be an object" };
    }

    // Whitelist and validate allowed fields
    const allowedFields: Record<string, unknown> = {};

    if (updates.alertName !== undefined) {
      if (typeof updates.alertName !== "string") {
        return { success: false, error: "Alert name must be a string" };
      }
      allowedFields.alertName = updates.alertName.trim().substring(0, 100);
    }

    if (updates.alertType !== undefined) {
      if (!["upper", "lower"].includes(updates.alertType)) {
        return {
          success: false,
          error: "Alert type must be 'upper' or 'lower'",
        };
      }
      allowedFields.alertType = updates.alertType;
    }

    if (updates.threshold !== undefined) {
      if (
        typeof updates.threshold !== "number" ||
        !Number.isFinite(updates.threshold) ||
        updates.threshold <= 0
      ) {
        return { success: false, error: "Threshold must be a positive number" };
      }
      allowedFields.threshold = updates.threshold;
    }

    if (updates.frequency !== undefined) {
      if (!["once", "daily", "hourly"].includes(updates.frequency)) {
        return {
          success: false,
          error: "Frequency must be 'once', 'daily', or 'hourly'",
        };
      }
      allowedFields.frequency = updates.frequency;
    }

    // Check if any valid updates were provided
    if (Object.keys(allowedFields).length === 0) {
      return { success: false, error: "No valid updates provided" };
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not found");

    // Get current user from auth
    const { getAuth } = await import("@/lib/better-auth/auth");
    const { headers } = await import("next/headers");
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return { success: false, error: "User not authenticated" };
    }

    const userId = session.user.id;

    // Update alert with only whitelisted fields
    const result = await Alert.updateOne(
      { _id: alertId, userId, isActive: true },
      { $set: allowedFields }
    );

    if (result.modifiedCount === 0) {
      return { success: false, error: "Alert not found" };
    }

    return { success: true };
  } catch (error) {
    console.error("updateAlert error:", error);
    return { success: false, error: "Failed to update alert" };
  }
}
