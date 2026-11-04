import { Router } from "express";
import {
  guest,
  login,
  me,
  signup,
  upgrade,
} from "../controllers/auth.controller.ts";
import {
  deleteSession,
  listSessions,
  logout,
  logoutAll,
  refresh,
} from "../controllers/session.controller.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import {
  generalApiLimiter,
  globalAuthLimiter,
  ipAuthLimiter,
  strictAccountLimiter,
} from "../../../shared/middlewares/rate-limit.ts";
import { verifyTurnstile } from "../../../shared/middlewares/turnstile.ts";

export const authRouter = Router();

// Guest onboarding: ipAuthLimiter -> verifyTurnstile -> globalAuthLimiter -> guest
authRouter.post(
  "/guest",
  ipAuthLimiter,
  verifyTurnstile,
  globalAuthLimiter,
  guest,
);

// Signup: ipAuthLimiter -> verifyTurnstile -> globalAuthLimiter -> strictAccountLimiter -> signup
authRouter.post(
  "/signup",
  ipAuthLimiter,
  verifyTurnstile,
  globalAuthLimiter,
  strictAccountLimiter,
  signup,
);

// Login: ipAuthLimiter -> verifyTurnstile -> globalAuthLimiter -> strictAccountLimiter -> login
authRouter.post(
  "/login",
  ipAuthLimiter,
  verifyTurnstile,
  globalAuthLimiter,
  strictAccountLimiter,
  login,
);

// Upgrade guest: ipAuthLimiter -> requireAuth -> verifyTurnstile -> globalAuthLimiter -> strictAccountLimiter -> upgrade
authRouter.post(
  "/upgrade",
  ipAuthLimiter,
  requireAuth,
  verifyTurnstile,
  globalAuthLimiter,
  strictAccountLimiter,
  upgrade,
);

// Refresh & Logout token flows (background flows: no Turnstile challenge)
authRouter.post("/refresh", globalAuthLimiter, ipAuthLimiter, refresh);
authRouter.post("/logout", globalAuthLimiter, ipAuthLimiter, logout);

// Authenticated session management (protected by requireAuth -> generalApiLimiter)
authRouter.get("/me", requireAuth, generalApiLimiter, me);
authRouter.post("/logout-all", requireAuth, generalApiLimiter, logoutAll);
authRouter.get("/sessions", requireAuth, generalApiLimiter, listSessions);
authRouter.delete("/sessions/:id", requireAuth, generalApiLimiter, deleteSession);
