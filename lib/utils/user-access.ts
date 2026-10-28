import { z } from "zod";
import { headers } from "next/headers";
import { connectToDatabase } from "@/database/mongoose";
import { getAuth } from "@/lib/better-auth/auth";

const emailSchema = z.email().max(254);

// Returns the email only if it is a plain, valid email string. Rejects
// objects such as {"$ne": null} before they can reach a database query.
export function parseEmail(value: unknown): string | null {
  const result = emailSchema.safeParse(value);
  return result.success ? result.data : null;
}

async function hasAccount(email: string): Promise<boolean> {
  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection not found");
  // Better Auth stores emails lowercased
  const count = await db
    .collection("user")
    .countDocuments({ email: email.toLowerCase() }, { limit: 1 });
  return count > 0;
}

/**
 * Decides whose watchlist and alerts a caller may read or change.
 *
 * A signed-in caller always gets their own data, whatever email they pass.
 * A guest may use an email only if no account owns it: a guest cannot prove
 * they own the address, so account data stays behind sign-in.
 * Returns null when the caller may not act for the requested email.
 */
export async function resolveDataOwner(
  requestedEmail?: unknown
): Promise<{ userId: string; email: string } | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    return { userId: session.user.id, email: session.user.email };
  }

  const email = parseEmail(requestedEmail);
  if (!email || (await hasAccount(email))) return null;

  // Guest data is stored with the email itself as the userId
  return { userId: email, email };
}
