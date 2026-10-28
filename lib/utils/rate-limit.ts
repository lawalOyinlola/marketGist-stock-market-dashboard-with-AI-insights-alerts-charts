import { createHash } from "crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import { RateLimit } from "@/database/models/rateLimit.model";
import { AuditLog, type AuditEvent } from "@/database/models/auditLog.model";

// Vercel overwrites x-forwarded-for with the real client IP, so the first
// entry can be trusted there. Behind another proxy, check it does the same.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Fixed-window counter stored in MongoDB, so the limit holds across
 * serverless instances (an in-memory counter resets with each one).
 * Keys are hashed so emails do not sit in the collection in plain text.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const resetAt = (bucket + 1) * windowMs;
  const hashedKey = createHash("sha256").update(key).digest("hex");

  try {
    await connectToDatabase();
    const doc = await RateLimit.findOneAndUpdate(
      { key: `${hashedKey}:${bucket}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } },
      { upsert: true, new: true }
    ).lean();

    return {
      allowed: (doc?.count ?? 0) <= max,
      retryAfterSeconds: Math.ceil((resetAt - now) / 1000),
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Fail open: a database error must not lock everyone out
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function checkIpRateLimit(
  name: string,
  max: number,
  windowSeconds: number
) {
  const ip = await getClientIp();
  return checkRateLimit(`${name}:ip:${ip}`, max, windowSeconds);
}

// Limits the caller's IP for a named route, for use in route handlers
export async function limitByIp(
  name: string,
  max: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const { allowed, retryAfterSeconds } = await checkIpRateLimit(
    name,
    max,
    windowSeconds
  );
  if (allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export function tooManyAttemptsMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Please try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;
}

// Never throws: a failed audit write must not fail the user's request
export async function recordAuditEvent(entry: {
  event: AuditEvent;
  success: boolean;
  userId?: string;
  email?: string;
}): Promise<void> {
  try {
    await connectToDatabase();
    await AuditLog.create({ ...entry, ip: await getClientIp() });
  } catch (error) {
    console.error("Failed to write audit event:", error);
  }
}
