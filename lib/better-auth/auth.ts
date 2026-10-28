import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { connectToDatabase } from "@/database/mongoose";
import { nextCookies } from "better-auth/next-js";
import { transporter } from "@/lib/nodemailer";
import { PASSWORD_RESET_EMAIL_TEMPLATE } from "@/lib/nodemailer/templates";

type MongoDb = Parameters<typeof mongodbAdapter>[0];

const createAuth = (db: MongoDb, secret: string, baseURL: string) =>
  betterAuth({
    database: mongodbAdapter(db),
    secret,
    baseURL,
    emailAndPassword: {
      resetPasswordTokenExpiresIn: 3600, // 1 hour in seconds
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

          // Use the professional email template
          const htmlTemplate = PASSWORD_RESET_EMAIL_TEMPLATE.replace(
            /\{\{resetUrl\}\}/g,
            resetUrl
          );

          await transporter.sendMail({
            from: `"Marketgist" <${process.env.NODEMAILER_EMAIL}>`,
            to: user.email,
            subject: "Reset Your Password - Marketgist",
            html: htmlTemplate,
            text: `Reset your password by clicking this link: ${resetUrl}`,
          });
        } catch (error) {
          console.error("Failed to send password reset email:", error);
          throw error;
        }
      },
    },
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
