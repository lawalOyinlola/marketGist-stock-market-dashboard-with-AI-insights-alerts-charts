"use server";

import { connectToDatabase } from "@/database/mongoose";
import { Watchlist } from "@/database/models/watchlist.model";
import { resolveDataOwner } from "@/lib/utils/user-access";
import { checkIpRateLimit } from "@/lib/utils/rate-limit";

const SYMBOL_PATTERN = /^[A-Z0-9.:\-]{1,20}$/;

// Trusts `email`, so only call it with an email the server already trusts
// (a session email, or a stored user in a background job). Never import it
// into a client component: that would make it a public endpoint.
export async function getWatchlistSymbolsByEmail(
  email: string
): Promise<string[]> {
  if (!email || typeof email !== "string") return [];

  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not found");

    // Better Auth stores users in the "user" collection
    const user = await db
      .collection("user")
      .findOne<{ _id?: unknown; id?: string; email?: string }>({ email });

    // Determine userId: authenticated user ID or email for guest users
    let userId: string;
    if (user) {
      userId =
        (user.id as string) ??
        (user._id as { toHexString?: () => string })?.toHexString?.() ??
        (user._id as { toString?: () => string })?.toString?.() ??
        "";
    } else {
      // Guest user - use email as userId
      userId = email;
    }

    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error("getWatchlistSymbolsByEmail error:", err);
    return [];
  }
}

export async function addToWatchlist(
  symbol: string,
  company: string,
  guestEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof symbol !== "string" || typeof company !== "string") {
      return { success: false, error: "Invalid stock" };
    }
    const normalized = symbol.toUpperCase().trim();
    if (!SYMBOL_PATTERN.test(normalized)) {
      return { success: false, error: "Invalid stock symbol" };
    }

    const { allowed } = await checkIpRateLimit("watchlist-write", 60, 600);
    if (!allowed) {
      return { success: false, error: "Too many requests. Please slow down." };
    }

    const owner = await resolveDataOwner(guestEmail);
    if (!owner) {
      return { success: false, error: "Please sign in to continue" };
    }
    const { userId } = owner;

    // Check if already in watchlist
    const existing = await Watchlist.findOne({ userId, symbol: normalized });

    if (existing) {
      return { success: false, error: "Stock already in watchlist" };
    }

    // Add to watchlist
    try {
      await Watchlist.create({
        userId,
        symbol: normalized,
        company: company.trim().substring(0, 100) || normalized,
        addedAt: new Date(),
      });
    } catch (e: unknown) {
      if ((e as { code?: unknown })?.code === 11000) {
        return { success: false, error: "Stock already in watchlist" };
      }
      throw e;
    }

    return { success: true };
  } catch (error) {
    console.error("addToWatchlist error:", error);
    return { success: false, error: "Failed to add to watchlist" };
  }
}

export async function removeFromWatchlist(
  symbol: string,
  guestEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof symbol !== "string") {
      return { success: false, error: "Invalid stock symbol" };
    }

    const { allowed } = await checkIpRateLimit("watchlist-write", 60, 600);
    if (!allowed) {
      return { success: false, error: "Too many requests. Please slow down." };
    }

    const owner = await resolveDataOwner(guestEmail);
    if (!owner) {
      return { success: false, error: "Please sign in to continue" };
    }

    // Remove from watchlist
    const result = await Watchlist.deleteOne({
      userId: owner.userId,
      symbol: symbol.toUpperCase(),
    });

    if (result.deletedCount === 0) {
      return { success: false, error: "Stock not found in watchlist" };
    }

    return { success: true };
  } catch (error) {
    console.error("removeFromWatchlist error:", error);
    return { success: false, error: "Failed to remove from watchlist" };
  }
}
