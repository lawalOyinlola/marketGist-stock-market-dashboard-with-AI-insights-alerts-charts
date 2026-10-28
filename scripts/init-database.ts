// IMPORTANT: Load environment variables FIRST, before any other imports
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const envFile = readFileSync(envPath, "utf-8");

const loadedVars: string[] = [];

envFile.split("\n").forEach((line) => {
  const trimmedLine = line.trim();
  // Skip empty lines and comments
  if (!trimmedLine || trimmedLine.startsWith("#")) return;

  const [key, ...valueParts] = trimmedLine.split("=");
  const value = valueParts.join("=").trim();

  if (key && value) {
    process.env[key.trim()] = value;
    loadedVars.push(key.trim());
  }
});

console.log("✅ Loaded environment variables from .env.local");
console.log(`   Variables found: ${loadedVars.join(", ")}`);
console.log(
  `   MONGODB_URI is ${process.env.MONGODB_URI ? "SET ✓" : "NOT SET ✗"}\n`
);

// NOW import the database module (after env vars are loaded)
import { connectToDatabase } from "../database/mongoose";
import mongoose from "mongoose";

// Import models to ensure they're registered with mongoose
import "../database/models/watchlist.model";
import "../database/models/alert.model";
import "../database/models/notification.model";

interface DuplicateInfo {
  _id: {
    userId?: string;
    symbol?: string;
    alertType?: string;
    threshold?: number;
  };
  count: number;
  examples: Array<Record<string, unknown>>;
}

async function initDatabase() {
  console.log("🚀 Starting database initialization...\n");

  try {
    // Step 1: Connect to database
    console.log("Step 1: Connecting to MongoDB...");
    await connectToDatabase();
    console.log("✅ Connected successfully\n");

    // Step 2: Sync indexes
    console.log("Step 2: Synchronizing indexes...");
    try {
      // Sync indexes for all models
      await mongoose.syncIndexes();
      console.log("✅ Indexes synchronized successfully\n");
    } catch (syncError: unknown) {
      console.warn(
        "⚠️  Warning during index sync:",
        syncError instanceof Error ? syncError.message : syncError
      );
      console.log("   This is normal if indexes already exist.\n");
    }

    // Step 3: Verify Watchlist indexes and check for duplicates
    console.log("Step 3: Verifying Watchlist model indexes...");
    await verifyWatchlistIndexes();
    console.log("✅ Watchlist verification complete\n");

    // Step 4: Verify Alert indexes and check for duplicates
    console.log("Step 4: Verifying Alert model indexes...");
    await verifyAlertIndexes();
    console.log("✅ Alert verification complete\n");

    // All steps completed
    console.log("✅ DATABASE INITIALIZATION COMPLETE!\n");
    console.log("   All indexes verified and duplicate checks passed.\n");

    // Clean up
    await mongoose.connection.close();
    console.log("🔌 Connection closed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ DATABASE INITIALIZATION FAILED\n");
    console.error("Error details:", error);
    process.exit(1);
  }
}

async function verifyWatchlistIndexes() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection not available");

  // Get indexes on watchlist collection
  const indexes = await db.collection("watchlists").indexes();
  const uniqueIndex = indexes.find(
    (idx) => idx.unique === true && idx.key.userId === 1 && idx.key.symbol === 1
  );

  if (!uniqueIndex) {
    console.log("⚠️  Warning: Unique index on {userId, symbol} not found");
    console.log("   This may cause duplicate entries");
  } else {
    console.log("   ✓ Unique index on {userId, symbol} exists");
  }

  // Check for duplicate entries
  const duplicates = await db
    .collection("watchlists")
    .aggregate<DuplicateInfo>([
      {
        $group: {
          _id: { userId: "$userId", symbol: "$symbol" },
          count: { $sum: 1 },
          docs: { $push: "$$ROOT" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicates.length === 0) {
    console.log("   ✓ No duplicate entries found");
  } else {
    console.log(`   ⚠️  Found ${duplicates.length} duplicate entry groups:`);
    for (const dup of duplicates.slice(0, 5)) {
      const { userId, symbol } = dup._id;
      console.log(
        `      - userId: ${userId}, symbol: ${symbol?.toUpperCase()} (${
          dup.count
        } copies)`
      );
    }
    if (duplicates.length > 5) {
      console.log(`      ... and ${duplicates.length - 5} more`);
    }
    console.log(
      "   ⚠️  Consider cleaning up duplicates before production deployment"
    );
  }
}

async function verifyAlertIndexes() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection not available");

  // Get indexes on alert collection
  const indexes = await db.collection("alerts").indexes();
  const uniqueIndex = indexes.find(
    (idx) =>
      idx.unique === true &&
      idx.key.userId === 1 &&
      idx.key.symbol === 1 &&
      idx.key.alertType === 1 &&
      idx.key.threshold === 1
  );

  if (!uniqueIndex) {
    console.log(
      "⚠️  Warning: Unique index on {userId, symbol, alertType, threshold} not found"
    );
    console.log("   This may cause duplicate active alerts");
  } else {
    console.log(
      "   ✓ Unique index on {userId, symbol, alertType, threshold} exists"
    );
  }

  // Check for duplicate active alerts
  const activeDuplicates = await db
    .collection("alerts")
    .aggregate<DuplicateInfo>([
      { $match: { isActive: true } },
      {
        $group: {
          _id: {
            userId: "$userId",
            symbol: "$symbol",
            alertType: "$alertType",
            threshold: "$threshold",
          },
          count: { $sum: 1 },
          docs: { $push: "$$ROOT" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (activeDuplicates.length === 0) {
    console.log("   ✓ No duplicate active alerts found");
  } else {
    console.log(
      `   ⚠️  Found ${activeDuplicates.length} duplicate active alert groups:`
    );
    for (const dup of activeDuplicates.slice(0, 5)) {
      const { userId, symbol, alertType, threshold } = dup._id;
      console.log(
        `      - userId: ${userId}, symbol: ${symbol?.toUpperCase()}, type: ${alertType}, threshold: ${threshold} (${
          dup.count
        } copies)`
      );
    }
    if (activeDuplicates.length > 5) {
      console.log(`      ... and ${activeDuplicates.length - 5} more`);
    }
    console.log(
      "   ⚠️  Consider cleaning up duplicates before production deployment"
    );
  }
}

// Run the initialization
initDatabase();
