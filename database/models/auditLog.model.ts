import { Schema, model, models, type Document, type Model } from "mongoose";

export type AuditEvent =
  | "sign_up"
  | "sign_in"
  | "password_reset_request"
  | "password_reset";

export interface AuditLogItem extends Document {
  event: AuditEvent;
  success: boolean;
  userId?: string;
  email?: string;
  ip: string;
  createdAt: Date;
}

// Append-only: the app inserts entries and never updates or deletes them.
const AuditLogSchema = new Schema<AuditLogItem>(
  {
    event: { type: String, required: true },
    success: { type: Boolean, required: true },
    userId: { type: String, index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    ip: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Keep 180 days, long enough to investigate a breach found weeks later
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 }
);

export const AuditLog: Model<AuditLogItem> =
  (models?.AuditLog as Model<AuditLogItem>) ||
  model<AuditLogItem>("AuditLog", AuditLogSchema);
