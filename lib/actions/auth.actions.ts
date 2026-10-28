"use server";

import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { getAuth } from "@/lib/better-auth/auth";
import { inngest } from "@/lib/inngest/client";
import { headers } from "next/headers";
import { connectToDatabase } from "@/database/mongoose";
import { Watchlist } from "@/database/models/watchlist.model";
import { Alert } from "@/database/models/alert.model";
import {
  INVESTMENT_GOALS,
  PREFERRED_INDUSTRIES,
  RISK_TOLERANCE_OPTIONS,
} from "@/lib/constants";
import {
  checkIpRateLimit,
  checkRateLimit,
  recordAuditEvent,
  tooManyAttemptsMessage,
} from "@/lib/utils/rate-limit";

const optionValues = (options: { value: string }[]) =>
  options.map((o) => o.value) as [string, ...string[]];

const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(8).max(128);

// Profile fields go into the welcome email's AI prompt, so only the values
// the sign-up form offers are accepted
const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(100),
  country: z.string().regex(/^[A-Z]{2}$/),
  investmentGoals: z.enum(optionValues(INVESTMENT_GOALS)),
  riskTolerance: z.enum(optionValues(RISK_TOLERANCE_OPTIONS)),
  preferredIndustry: z.enum(optionValues(PREFERRED_INDUSTRIES)),
});

const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 60 * 60;

export const signUpWithEmail = async (data: SignUpFormData) => {
  // Set once input is valid, so the catch block can audit the failure
  let validEmail: string | undefined;
  try {
    const parsed = signUpSchema.safeParse(data);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return {
        success: false,
        error:
          field === "email"
            ? "Invalid email format"
            : field === "password"
            ? "Password must be between 8 and 128 characters"
            : "Please check your details and try again",
      };
    }
    const {
      email,
      password,
      fullName,
      country,
      investmentGoals,
      riskTolerance,
      preferredIndustry,
    } = parsed.data;
    validEmail = email;

    const limit = await checkIpRateLimit("sign-up", 5, ONE_HOUR);
    if (!limit.allowed) {
      return {
        success: false,
        error: tooManyAttemptsMessage(limit.retryAfterSeconds),
      };
    }

    const auth = await getAuth();
    const response = await auth.api.signUpEmail({
      body: { email, password, name: fullName },
    });

    if (response) {
      await recordAuditEvent({
        event: "sign_up",
        success: true,
        userId: response.user?.id,
        email,
      });

      try {
        // Migrate guest data to new user account
        const newUserId = response?.user?.id ?? "";
        if (newUserId) {
          await migrateGuestData(email, newUserId);
        }

        await inngest.send({
          name: "app/user.created",
          data: {
            email,
            name: fullName,
            country,
            investmentGoals,
            riskTolerance,
            preferredIndustry,
          },
        });
      } catch (eventError) {
        console.error("Failed to send welcome email event:", eventError);
        // User is created but email won't be sent - could add to a retry queue
      }
    }

    // The session is in the cookie; do not send the token back in the body
    return { success: true };
  } catch (e) {
    console.error("Sign up failed:", e);
    if (validEmail) {
      await recordAuditEvent({
        event: "sign_up",
        success: false,
        email: validEmail,
      });
    }
    const errorMessage = e instanceof Error ? e.message : "Sign up failed";

    return {
      success: false,
      error: errorMessage.includes("already exists")
        ? "An account with this email already exists"
        : "Sign up failed. Please try again.",
    };
  }
};

export const signInWithEmail = async ({ email, password }: SignInFormData) => {
  if (
    !emailSchema.safeParse(email).success ||
    typeof password !== "string" ||
    !password
  ) {
    return { success: false, error: "Invalid email or password" };
  }

  // Rate limits and the audit entry for sign-in live in the Better Auth
  // hooks (lib/better-auth/auth.ts), so /api/auth/sign-in/email gets them too
  try {
    const auth = await getAuth();
    const response = await auth.api.signInEmail({ body: { email, password } });

    if (response) {
      try {
        // Migrate guest data to authenticated user account
        const newUserId = response?.user?.id ?? "";
        if (newUserId) {
          await migrateGuestData(email, newUserId);
        }
      } catch (migrationError) {
        console.error("Failed to migrate guest data:", migrationError);
        // Don't fail sign-in if migration fails
      }
    }

    // The session is in the cookie; do not send the token back in the body
    return { success: true };
  } catch (e) {
    console.error("Sign in failed", e);
    if (isAPIError(e) && e.statusCode === 429) {
      return { success: false, error: e.message };
    }
    const errorMessage = e instanceof Error ? e.message : "Sign in failed";

    return {
      success: false,
      error:
        errorMessage.includes("Invalid credentials") ||
        errorMessage.includes("not found")
          ? "Invalid email or password"
          : "Sign in failed. Please try again.",
    };
  }
};

export const signOut = async () => {
  try {
    const auth = await getAuth();
    await auth.api.signOut({ headers: await headers() });
    return { success: true };
  } catch (e) {
    console.error("Sign out failed", e);
    return { success: false, error: "Sign out failed" };
  }
};

export const requestPasswordReset = async ({
  email,
}: ForgotPasswordFormData) => {
  if (!emailSchema.safeParse(email).success) {
    return { success: false, error: "Invalid email format" };
  }

  const ipLimit = await checkIpRateLimit(
    "password-reset-request",
    5,
    FIFTEEN_MINUTES
  );
  const accountLimit = await checkRateLimit(
    `password-reset-request:email:${email.toLowerCase()}`,
    3,
    ONE_HOUR
  );
  if (!ipLimit.allowed || !accountLimit.allowed) {
    return {
      success: false,
      error: tooManyAttemptsMessage(
        Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds)
      ),
    };
  }

  try {
    // Better Auth answers the same way whether or not the account exists.
    // We construct our own URL in sendResetPassword, so we don't need redirectTo
    const auth = await getAuth();
    await auth.api.requestPasswordReset({ body: { email } });
    await recordAuditEvent({
      event: "password_reset_request",
      success: true,
      email,
    });

    return { success: true };
  } catch (e) {
    console.error("Password reset request failed", e);
    await recordAuditEvent({
      event: "password_reset_request",
      success: false,
      email,
    });

    // Same message whatever went wrong, so the response never reveals
    // whether an account exists
    return {
      success: false,
      error: "Failed to send password reset email. Please try again.",
    };
  }
};

export const resetPasswordWithToken = async ({
  token,
  password,
}: ResetPasswordWithTokenData) => {
  if (typeof token !== "string" || !token || token.length > 512) {
    return { success: false, error: "Token and password are required" };
  }
  if (!passwordSchema.safeParse(password).success) {
    return {
      success: false,
      error: "Password must be between 8 and 128 characters",
    };
  }

  const limit = await checkIpRateLimit("password-reset", 10, FIFTEEN_MINUTES);
  if (!limit.allowed) {
    return {
      success: false,
      error: tooManyAttemptsMessage(limit.retryAfterSeconds),
    };
  }

  try {
    // Better Auth ends every session of the user on success
    // (revokeSessionsOnPasswordReset in lib/better-auth/auth.ts)
    const auth = await getAuth();
    await auth.api.resetPassword({
      body: { token, newPassword: password },
    });
    await recordAuditEvent({ event: "password_reset", success: true });

    return { success: true };
  } catch (e) {
    console.error("Password reset failed", e);
    await recordAuditEvent({ event: "password_reset", success: false });
    const errorMessage =
      e instanceof Error ? e.message : "Password reset failed";

    return {
      success: false,
      error:
        errorMessage.includes("INVALID_TOKEN") ||
        errorMessage.includes("expired") ||
        errorMessage.includes("invalid token")
          ? "Invalid or expired reset link. Please request a new one."
          : "Failed to reset password. Please try again.",
    };
  }
};

/**
 * Migrates guest user data (watchlist and alerts) to a new authenticated user account.
 * Only migrates if guest data exists for the provided email.
 * Called when user signs up or signs in with the same email used as a guest.
 */
async function migrateGuestData(email: string, newUserId: string) {
  try {
    if (!newUserId) {
      console.log("No authenticated user id provided, skipping migration");
      return;
    }

    const mongoose = await connectToDatabase();

    // Check if guest data exists for this email before migrating
    const watchlistCount = await Watchlist.countDocuments({ userId: email });
    const alertsCount = await Alert.countDocuments({ userId: email });

    if (watchlistCount === 0 && alertsCount === 0) {
      console.log("No guest data found, skipping migration");
      return;
    }

    const session = await mongoose.startSession();
    let watchlistModified = 0;
    let alertsModified = 0;

    await session.withTransaction(async () => {
      // 1) WATCHLIST: dedupe by symbol before reassigning userId
      const existingUserWatchlist: Array<{ symbol: string }> =
        await Watchlist.find(
          { userId: newUserId },
          { symbol: 1 },
          { session }
        ).lean();
      const existingSymbols = new Set(
        existingUserWatchlist.map((w: { symbol: string }) => String(w.symbol))
      );

      if (existingSymbols.size > 0) {
        const deleteRes = await Watchlist.deleteMany(
          { userId: email, symbol: { $in: Array.from(existingSymbols) } },
          { session }
        );
        // deleteRes.deletedCount may be undefined in older drivers; default to 0
      }

      const wlUpdateRes = await Watchlist.updateMany(
        { userId: email },
        { $set: { userId: newUserId } },
        { session }
      );
      watchlistModified = wlUpdateRes.modifiedCount ?? 0;

      // 2) ALERTS: remove conflicting active guest alerts, migrate remaining (including inactive)
      const existingActiveAlerts = await Alert.find(
        { userId: newUserId, isActive: true },
        { symbol: 1, alertType: 1, threshold: 1 },
        { session }
      ).lean();

      const existingActiveKeySet = new Set(
        (
          existingActiveAlerts as unknown as Array<{
            symbol: string;
            alertType: string;
            threshold: number;
          }>
        ).map((a) => `${a.symbol}|${a.alertType}|${a.threshold}`)
      );

      // Find guest active alerts and delete only those that conflict
      const guestActiveAlerts = await Alert.find(
        { userId: email, isActive: true },
        { _id: 1, symbol: 1, alertType: 1, threshold: 1 },
        { session }
      ).lean();

      const conflictingGuestIds = (
        guestActiveAlerts as unknown as Array<{
          _id: unknown;
          symbol: string;
          alertType: string;
          threshold: number;
        }>
      )
        .filter((a) =>
          existingActiveKeySet.has(`${a.symbol}|${a.alertType}|${a.threshold}`)
        )
        .map((a) => a._id);

      if (conflictingGuestIds.length > 0) {
        await Alert.deleteMany(
          { _id: { $in: conflictingGuestIds } },
          { session }
        );
      }

      const alUpdateRes = await Alert.updateMany(
        { userId: email },
        { $set: { userId: newUserId } },
        { session }
      );
      alertsModified = alUpdateRes.modifiedCount ?? 0;
    });

    await session.endSession();

    console.log(
      `Migrated ${watchlistModified} watchlist items and ${alertsModified} alerts`
    );
  } catch (error) {
    console.error("Error migrating guest data:", error);
    // Don't throw error - migration failure shouldn't prevent signup
  }
}
