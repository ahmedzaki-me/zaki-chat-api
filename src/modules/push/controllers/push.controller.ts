import type { RequestHandler } from "express";
import { env } from "../../../config/env.ts";
import { deleteOwnSubscription, upsertSubscription } from "../services/subscription.service.ts";
import { deleteSubscriptionSchema, upsertSubscriptionSchema } from "../schemas/push.schemas.ts";

export const getPushConfig: RequestHandler = (_req, res) => {
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
  res.json(enabled ? { enabled: true, publicKey: env.VAPID_PUBLIC_KEY } : { enabled: false, publicKey: null, message: "Web Push is disabled." });
};
export const putPushSubscription: RequestHandler = async (req, res) => {
  const input = upsertSubscriptionSchema.parse(req.body);
  await upsertSubscription(req.auth!.id, req.auth!.sid, req.get("user-agent") ?? "", input);
  res.status(204).end();
};
export const removePushSubscription: RequestHandler = async (req, res) => {
  const { endpoint } = deleteSubscriptionSchema.parse(req.body);
  await deleteOwnSubscription(req.auth!.id, req.auth!.sid, endpoint);
  res.status(204).end();
};
