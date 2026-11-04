import { Router } from "express";
import { requireAuth } from "../../auth/middleware/require-auth.ts";
import { generalApiLimiter } from "../../../shared/middlewares/rate-limit.ts";
import {
  edit,
  hardDelete,
  softDelete,
} from "../controllers/message.controller.ts";
import * as reactions from "../controllers/reaction.controller.ts";

// Everything addressed by message id, mounted at /messages.
export const messageItemRouter = Router();

messageItemRouter.use(requireAuth);
messageItemRouter.use(generalApiLimiter);

messageItemRouter.patch("/:id", edit);
messageItemRouter.delete("/:id", softDelete);
messageItemRouter.delete("/:id/permanent", hardDelete);

messageItemRouter.post("/:id/reactions", reactions.add);
messageItemRouter.delete("/:id/reactions/:emoji", reactions.remove);
