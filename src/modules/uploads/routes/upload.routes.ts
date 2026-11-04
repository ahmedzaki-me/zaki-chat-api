import { Router } from "express";
import { requireAuth } from "../../auth/middleware/require-auth.ts";
import { generalApiLimiter } from "../../../shared/middlewares/rate-limit.ts";
import { presign } from "../controllers/upload.controller.ts";

export const uploadsRouter = Router();

uploadsRouter.post("/presign", requireAuth, generalApiLimiter, presign);
