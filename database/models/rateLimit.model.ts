import { Schema, model, models, type Document, type Model } from "mongoose";

export interface RateLimitItem extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

// One document per key per time window. Not Better Auth's "rateLimit"
// collection, which it manages itself.
const RateLimitSchema = new Schema<RateLimitItem>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

// MongoDB deletes each window's document once the window has ended
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit: Model<RateLimitItem> =
  (models?.RequestRateLimit as Model<RateLimitItem>) ||
  model<RateLimitItem>("RequestRateLimit", RateLimitSchema);
