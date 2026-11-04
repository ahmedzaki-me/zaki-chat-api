import { Schema, model, type InferSchemaType } from "mongoose";

const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ip: { type: String },
    userAgent: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ user: 1, revokedAt: 1 });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
