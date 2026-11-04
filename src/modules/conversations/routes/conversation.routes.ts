import { Router } from "express";
import { requireAuth } from "../../auth/middleware/require-auth.ts";
import { generalApiLimiter } from "../../../shared/middlewares/rate-limit.ts";
import {
  getById,
  getMine,
  list,
  pin,
  unpin,
} from "../controllers/conversation.controller.ts";
import { messagesRouter } from "../../messages/routes/message.routes.ts";

export const conversationsRouter = Router();

// Require JWT authentication, then apply per-user REST rate limiter
conversationsRouter.use(requireAuth);
conversationsRouter.use(generalApiLimiter);

// Nested messages routes (inherit requireAuth and generalApiLimiter)
conversationsRouter.use("/:id/messages", messagesRouter);

conversationsRouter.get("/", list);
conversationsRouter.get("/me", getMine); // must stay before "/:id"
conversationsRouter.get("/:id", getById);

conversationsRouter.patch("/:id/pin", pin);
conversationsRouter.delete("/:id/pin", unpin);
