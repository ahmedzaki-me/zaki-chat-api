import type { RequestHandler } from "express";
import { AppError } from "../../../shared/errors/app-error.ts";
import { sessionIdParamsSchema } from "../schemas/auth.schemas.ts";
import {
  listActiveSessions,
  logoutSession,
  refreshAccessToken,
  revokeAllSessions,
  revokeSession,
} from "../services/session.service.ts";
import {
  clearRefreshCookie,
  getRefreshCookie,
  sendSession,
  toPublicSession,
} from "./auth.http.ts";

export const refresh: RequestHandler = async (req, res) => {
  const token = getRefreshCookie(req);

  if (!token) {
    throw AppError.unauthorized(
      "Missing refresh token.",
      "MISSING_REFRESH_TOKEN",
    );
  }

  await sendSession(res, 200, await refreshAccessToken(token));
};

export const logout: RequestHandler = async (req, res) => {
  const token = getRefreshCookie(req);

  if (token) {
    await logoutSession(token);
  }

  clearRefreshCookie(res);
  res.status(204).end();
};

export const listSessions: RequestHandler = async (req, res) => {
  const { id: userId, sid } = req.auth!;
  const sessions = await listActiveSessions(userId);
  res.json({ sessions: sessions.map((s) => toPublicSession(s, sid)) });
};

export const deleteSession: RequestHandler = async (req, res) => {
  const { id } = sessionIdParamsSchema.parse(req.params);
  const { id: userId, sid } = req.auth!;

  await revokeSession(userId, id);

  if (id === sid) {
    clearRefreshCookie(res);
  }
  res.status(204).end();
};

export const logoutAll: RequestHandler = async (req, res) => {
  await revokeAllSessions(req.auth!.id);
  clearRefreshCookie(res);
  res.status(204).end();
};
