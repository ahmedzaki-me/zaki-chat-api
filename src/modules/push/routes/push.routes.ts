import { Router } from "express";
import { requireAuth } from "../../auth/middleware/require-auth.ts";
import { generalApiLimiter } from "../../../shared/middlewares/rate-limit.ts";
import {
  getPushConfig,
  putPushSubscription,
  removePushSubscription,
} from "../controllers/push.controller.ts";

export const pushRouter = Router();

// Public VAPID public key endpoint
pushRouter.get("/config", getPushConfig);

// Authenticated push subscriptions
pushRouter.post(
  "/subscriptions",
  requireAuth,
  generalApiLimiter,
  putPushSubscription,
);
pushRouter.delete(
  "/subscriptions",
  requireAuth,
  generalApiLimiter,
  removePushSubscription,
);
