import { PushSubscriptionModel } from "../models/push-subscription.model.ts";
import type { UpsertSubscriptionInput } from "../schemas/push.schemas.ts";

export function upsertSubscription(userId: string, sessionId: string, userAgent: string, input: UpsertSubscriptionInput) {
  return PushSubscriptionModel.updateOne({ endpoint: input.endpoint }, {
    $set: { userId, sessionId, keys: input.keys, userAgent },
    $setOnInsert: { endpoint: input.endpoint, createdAt: new Date() },
  }, { upsert: true });
}

export function deleteOwnSubscription(userId: string, sessionId: string, endpoint: string) {
  return PushSubscriptionModel.deleteOne({ userId, sessionId, endpoint });
}

export function deleteSessionSubscriptions(sessionId: string) {
  return PushSubscriptionModel.deleteMany({ sessionId });
}
