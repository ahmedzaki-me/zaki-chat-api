import { Schema, model, type InferSchemaType } from "mongoose";

const pushSubscriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String, default: "" },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
pushSubscriptionSchema.index({ userId: 1 });
pushSubscriptionSchema.index({ sessionId: 1 });

export type PushSubscription = InferSchemaType<typeof pushSubscriptionSchema>;
export const PushSubscriptionModel = model("PushSubscription", pushSubscriptionSchema);
