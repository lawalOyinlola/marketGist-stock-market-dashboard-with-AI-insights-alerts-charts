import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { connectToDatabase } from "@/database/mongoose";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { sendEmail } from "@/lib/mailer";
import { passwordResetEmail } from "@/lib/mailer/templates";
import {
  checkIpRateLimit,
  checkRateLimit,
  recordAuditEvent,
  tooManyAttemptsMessage,
} from "@/lib/utils/rate-limit";

type MongoDb = Parameters<typeof mongodbAdapter>[0];

const SIGN_IN_PATH = "/sign-in/email";
const FIFTEEN_MINUTES = 15 * 60;

const signInEmailOf = (body: unknown): string => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.toLowerCase() : "";
};

// Hooks run for /api/auth/* requests and for auth.api.* calls from server
// actions, so both paths share the same sign-in limits and audit trail.
const hooks = {
  // Per IP stops one attacker spraying many accounts. Per account stops many
  // IPs guessing one password. It slows guessing down, it does not lock out.
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_IN_PATH) return;
    const email = signInEmailOf(ctx.body);
    const ipLimit = await checkIpRateLimit("sign-in", 20, FIFTEEN_MINUTES);
    const accountLimit = await checkRateLimit(
      `sign-in:email:${email}`,
      10,
      FIFTEEN_MINUTES
    );
    if (!ipLimit.allowed || !accountLimit.allowed) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: tooManyAttemptsMessage(
          Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds)
        ),
      });
    }
  }),
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGN_IN_PATH) return;
    const returned = ctx.context.returned;
    const success = !isAPIError(returned);
    await recordAuditEvent({
      event: "sign_in",
      success,
      userId: success
        ? (returned as { user?: { id?: string } } | undefined)?.user?.id
        : undefined,
      email: signInEmailOf(ctx.body),
    });
  }),
};

const createAuth = (db: MongoDb, secret: string, baseURL: string) =>
  betterAuth({
    database: mongodbAdapter(db),
    secret,
    baseURL,
    emailAndPassword: {
      resetPasswordTokenExpiresIn: 3600, // 1 hour in seconds
      // A reset must evict anyone already signed in as this user
      revokeSessionsOnPasswordReset: true,
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      sendResetPassword: async ({ user, url, token }, request) => {
        try {
          // Construct direct reset password URL with encoded token
          const base = process.env.BETTER_AUTH_URL || baseURL; // reuse validated baseURL
          const reset = new URL("/reset-password", base);
          reset.searchParams.set("token", token);
          const resetUrl = reset.toString();

          await sendEmail({
            fromName: "Marketgist",
            to: user.email,
            ...passwordResetEmail({ resetUrl, appUrl: base }),
          });
        } catch (error) {
          console.error("Failed to send password reset email:", error);
          throw error;
        }
      },
    },
    // Applies to requests to /api/auth/*. The default in-memory store resets
    // with each serverless instance; the database store is shared.
    rateLimit: { storage: "database" },
    hooks,
    plugins: [nextCookies()],
  });

let authInstance: ReturnType<typeof createAuth> | null = null;

export const getAuth = async () => {
  if (authInstance) return authInstance;

  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;

  if (!db) throw new Error("MongoDB connection not found");

  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;

  if (!secret || !baseURL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL must be set");
  }

  authInstance = createAuth(db as MongoDb, secret, baseURL);

  return authInstance;
};
