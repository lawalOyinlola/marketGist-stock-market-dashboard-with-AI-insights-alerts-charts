"use server";

import { connectToDatabase } from "@/database/mongoose";

type NewsUser = { id: string; email: string; name: string };

export const getAllUsersForNewsEmail = async (): Promise<NewsUser[]> => {
  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not found");

    // Get authenticated users
    const authUsers = await db
      .collection("user")
      .find(
        { email: { $exists: true, $ne: null } },
        { projection: { _id: 1, id: 1, email: 1, name: 1, country: 1 } }
      )
      .toArray();

    const authenticatedUsers = authUsers
      .filter((user) => user.email && user.name)
      .map((user) => ({
        id: user.id || user._id?.toString() || "",
        email: user.email,
        name: user.name,
      }));

    // Get guest users from watchlist/alert collections (userId is email for guests)
    const { Watchlist } = await import("@/database/models/watchlist.model");
    const { Alert } = await import("@/database/models/alert.model");

    // Get unique guest emails from watchlist
    const guestWatchlistEmails = new Set<string>();
    const watchlistItems = await Watchlist.find({}, { userId: 1 }).lean();
    const authenticatedEmailSet = new Set(
      authenticatedUsers.map((user) => user.email.trim().toLowerCase())
    );

    for (const item of watchlistItems) {
      const userId = String(item.userId ?? "");
      const normalizedUserId = userId.trim().toLowerCase();
      // If userId looks like an email and is not an authenticated user
      if (normalizedUserId.includes("@")) {
        if (!authenticatedEmailSet.has(normalizedUserId)) {
          guestWatchlistEmails.add(normalizedUserId);
        }
      }
    }

    // Get unique guest emails from alerts
    const guestAlertEmails = new Set<string>();
    const alerts = await Alert.find({}, { userId: 1 }).lean();
    for (const alert of alerts) {
      const userId = String(alert.userId ?? "");
      const normalizedUserId = userId.trim().toLowerCase();
      // Check if it's likely an email (contains @)
      if (normalizedUserId.includes("@")) {
        if (
          !authenticatedEmailSet.has(normalizedUserId) &&
          !guestWatchlistEmails.has(normalizedUserId)
        ) {
          guestAlertEmails.add(normalizedUserId);
        }
      }
    }

    // Combine all guest emails
    const allGuestEmails = Array.from(
      new Set([...guestWatchlistEmails, ...guestAlertEmails])
    );

    // Create guest users (use email as both id and name placeholder)
    const guestUsers = allGuestEmails.map((email) => ({
      id: email,
      email: email,
      name: email.split("@")[0], // Use email prefix as name
    }));

    return [...authenticatedUsers, ...guestUsers];
  } catch (e) {
    console.error("Error fetching users for news email:", e);
    return [];
  }
};

/**
 * Get inactive users who haven't logged in for 30+ days
 * A user is considered inactive if:
 * 1. They haven't had any active sessions in the last 30 days, OR
 * 2. They have no sessions at all
 */
export const getInactiveUsers = async (): Promise<NewsUser[]> => {
  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not found");

    const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get all users
    const users = await db
      .collection("user")
      .find(
        { email: { $exists: true, $ne: null } },
        { projection: { _id: 1, id: 1, email: 1, name: 1, createdAt: 1 } }
      )
      .toArray();

    // Get all sessions that are active and accessed in the last 30 days
    const activeUserIds = new Set<string>();

    const sessions = await db
      .collection("session")
      .find({ expiresAt: { $gte: new Date() } }) // Active sessions only
      .toArray();

    for (const session of sessions) {
      const rawUserId = session.userId;
      const userId: string | undefined =
        typeof rawUserId === "string" ? rawUserId : rawUserId?.toString?.();
      if (!userId) continue;

      // Check various possible timestamp fields
      const sessionTime =
        session.lastAccessedAt ||
        session.updatedAt ||
        session.createdAt ||
        session.lastAccessed ||
        session.updated;

      if (sessionTime) {
        const sessionDate = new Date(sessionTime);
        if (sessionDate >= THIRTY_DAYS_AGO) {
          activeUserIds.add(userId);
        }
      } else {
        // If no timestamp field found, consider it inactive (safety default)
      }
    }

    // Filter for inactive users
    const inactiveUsers = users.filter((user) => {
      const userId =
        user.id ||
        (user._id as { toString?: () => string })?.toString?.() ||
        "";
      return !activeUserIds.has(userId);
    });

    return inactiveUsers
      .filter((user) => user.email && user.name)
      .map((user) => ({
        id: user.id || user._id?.toString() || "",
        email: user.email,
        name: user.name,
      }));
  } catch (e) {
    console.error("Error fetching inactive users:", e);
    return [];
  }
};
