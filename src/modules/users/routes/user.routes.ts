import { Router } from "express";
import { requireAuth } from "../../auth/middleware/require-auth.ts";
import { generalApiLimiter } from "../../../shared/middlewares/rate-limit.ts";
import { deleteAvatar, putAvatar } from "../controllers/user.controller.ts";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.use(generalApiLimiter);

usersRouter.put("/me/avatar", putAvatar);
usersRouter.delete("/me/avatar", deleteAvatar);
