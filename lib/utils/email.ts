import { createHmac, timingSafeEqual } from "crypto";
import { connectToDatabase } from "@/database/mongoose";
import { EmailPreference } from "@/database/models/emailPreference.model";

/**
 * Check if user is unsubscribed from emails
 */
export async function isUserUnsubscribed(email: string): Promise<boolean> {
  try {
    await connectToDatabase();
    const preference = await EmailPreference.findOne({
      email: email.toLowerCase(),
    });
    return preference?.unsubscribed || false;
  } catch (error) {
    console.error("Error checking unsubscribe status:", error);
    // If there's an error, allow the email to be sent (fail open)
    return false;
  }
}

// The "unsubscribe:" label means this signature is useless for anything
// else the same secret signs. Rotating BETTER_AUTH_SECRET voids old links.
function signUnsubscribe(email: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be set");
  return createHmac("sha256", secret)
    .update(`unsubscribe:${email.toLowerCase()}`)
    .digest("base64url");
}

/**
 * Get unsubscribe URL for an email. The token proves the link came from us,
 * so nobody can unsubscribe an address they do not receive mail at.
 */
export function getUnsubscribeUrl(email: string): string {
  const dashboardUrl = process.env.BETTER_AUTH_URL || "https://marketgist.com";
  const url = new URL("/unsubscribe", dashboardUrl);
  url.searchParams.set("email", email);
  url.searchParams.set("token", signUnsubscribe(email));
  return url.toString();
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = Buffer.from(signUnsubscribe(email));
  const actual = Buffer.from(token);
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}
