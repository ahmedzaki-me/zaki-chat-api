import type { RequestHandler } from "express";
import { AppError } from "../../../shared/errors/app-error.ts";
import { assertSessionActive } from "../services/session.service.ts";
import { verifyAccessToken } from "../services/token.service.ts";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    throw AppError.unauthorized(
      "Missing or malformed Authorization header.",
      "MISSING_TOKEN",
    );
  }

  const auth = await verifyAccessToken(token);
  await assertSessionActive(auth.id, auth.sid);

  req.auth = auth;
  req.user = auth;
  next();
};
