// Setup Verification Script
// Run with: pnpm tsx scripts/verify-setup.ts

import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");

console.log("🔍 Verifying MarketGist Setup...\n");

// Check if .env.local exists
try {
  const envFile = readFileSync(envPath, "utf-8");
  console.log("✅ .env.local file found\n");

  // Parse environment variables
  const envVars: Record<string, string> = {};
  envFile.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return;
    const [key, ...valueParts] = trimmedLine.split("=");
    const value = valueParts.join("=").trim();
    if (key && value) {
      envVars[key.trim()] = value;
    }
  });

  // Check required variables
  const requiredVars = [
    "MONGODB_URI",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "FINNHUB_API_KEY",
    "GEMINI_API_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
  ];

  console.log("📋 Checking Required Environment Variables:\n");

  let allPresent = true;
  for (const varName of requiredVars) {
    if (envVars[varName]) {
      const value = envVars[varName];
      const displayValue =
        varName.includes("SECRET") ||
        varName.includes("PASSWORD") ||
        varName.includes("KEY")
          ? `${value.substring(0, 8)}...`
          : value;
      console.log(`  ✅ ${varName}: ${displayValue}`);
    } else {
      console.log(`  ❌ ${varName}: MISSING`);
      allPresent = false;
    }
  }

  console.log("\n" + "=".repeat(50) + "\n");

  if (!allPresent) {
    console.log("❌ Some required environment variables are missing!");
    console.log("📝 Please check your .env.local file\n");
    process.exit(1);
  }

  console.log("✅ All required environment variables are present!\n");

  // Additional checks
  console.log("🔍 Additional Checks:\n");

  // Check BETTER_AUTH_SECRET length
  if (envVars.BETTER_AUTH_SECRET && envVars.BETTER_AUTH_SECRET.length < 32) {
    console.log("  ⚠️  BETTER_AUTH_SECRET should be at least 32 characters");
  } else {
    console.log("  ✅ BETTER_AUTH_SECRET length is sufficient");
  }

  // Check RESEND_API_KEY format (Resend keys start with "re_")
  if (envVars.RESEND_API_KEY) {
    if (envVars.RESEND_API_KEY.startsWith("re_")) {
      console.log("  ✅ RESEND_API_KEY looks like a Resend API key");
    } else {
      console.log('  ⚠️  RESEND_API_KEY should start with "re_"');
    }
  }

  // Check EMAIL_FROM is a bare address; the app adds the display name
  if (envVars.EMAIL_FROM) {
    if (/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(envVars.EMAIL_FROM)) {
      console.log("  ✅ EMAIL_FROM is a bare email address");
    } else {
      console.log(
        "  ⚠️  EMAIL_FROM should be a bare address such as alerts@your-domain.com, without a display name",
      );
    }
  }

  // Check MONGODB_URI format
  if (envVars.MONGODB_URI) {
    if (
      envVars.MONGODB_URI.startsWith("mongodb://") ||
      envVars.MONGODB_URI.startsWith("mongodb+srv://")
    ) {
      console.log("  ✅ MONGODB_URI format looks correct");
    } else {
      console.log(
        "  ⚠️  MONGODB_URI should start with 'mongodb://' or 'mongodb+srv://'",
      );
    }
  }

  console.log("\n" + "=".repeat(50) + "\n");
  console.log("📚 Next Steps:\n");
  console.log("1. Test database connection: pnpm run test:db");
  console.log("2. Initialize database: pnpm run init:db");
  console.log("3. Start Next.js app: pnpm dev");
  console.log("4. Start Inngest Dev Server: npx inngest-cli@latest dev");
  console.log("5. Check Inngest UI: http://localhost:8288\n");
} catch (error) {
  console.log("❌ .env.local file not found!");
  console.log("📝 Please create .env.local file based on .env.example\n");
  console.log("💡 Copy .env.example to .env.local and fill in the values:");
  console.log("   cp .env.example .env.local\n");
  process.exit(1);
}
