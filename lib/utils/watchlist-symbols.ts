import { connectToDatabase } from "@/database/mongoose";
import { Watchlist } from "@/database/models/watchlist.model";

// Trusts `email`, so only call it with an email the server already trusts:
// a session email, or a stored user in a background job. It lives outside
// "use server" files so it can never become a public server action.
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
