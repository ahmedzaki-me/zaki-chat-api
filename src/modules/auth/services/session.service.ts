import type { Types } from "mongoose";
import { AppError } from "../../../shared/errors/app-error.ts";
import { realtimeBus } from "../../../realtime/bus.ts";
import { UserModel, type User } from "../../users/models/user.model.ts";
import { RefreshTokenModel } from "../models/refresh-token.model.ts";
import { SessionModel } from "../models/session.model.ts";
import {
  REFRESH_TOKEN_TTL_MS,
  hashToken,
  issueRefreshToken,
} from "./refresh-token.service.ts";
import { signAccessToken } from "./token.service.ts";
import { deleteSessionSubscriptions } from "../../push/services/subscription.service.ts";

export type SessionMeta = {
  ip?: string;
  userAgent?: string;
  /** Refresh token already held by this client; its session gets ended. */
  previousRefreshToken?: string;
};

async function createSession(userId: string, { ip, userAgent }: SessionMeta) {
  return SessionModel.create({
    user: userId,
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
}

/** Revokes one session together with all of its refresh tokens. */
async function revokeSessionById(sessionId: string | Types.ObjectId) {
  const session = await SessionModel.findById(sessionId).select("user").lean();
  if (!session) return;
  const now = new Date();
  await SessionModel.updateOne(
    { _id: sessionId, revokedAt: null },
    { revokedAt: now },
  );
  await deleteSessionSubscriptions(String(sessionId));
  realtimeBus.emit("session.revoked", {
    userId: String(session.user),
    sessionId: String(sessionId),
  });
  await RefreshTokenModel.updateMany(
    { session: sessionId, revokedAt: null },
    { revokedAt: now },
  );
}

/* ---------- open / refresh ---------- */

/**
 * Ends the client's previous session (if any), then creates a new session
 * and issues its first access + refresh tokens.
 */
export async function openSession(
  user: { id: string; role: User["role"] },
  meta: SessionMeta,
) {
  if (meta.previousRefreshToken) {
    await logoutSession(meta.previousRefreshToken);
  }

  const session = await createSession(user.id, meta);
  const accessToken = await signAccessToken({
    id: user.id,
    role: user.role,
    sid: session.id,
  });
  const refreshToken = await issueRefreshToken(user.id, session.id);
  return { accessToken, refreshToken };
}

/** Rotates the refresh token; reuse of an old token revokes the whole session. */
export async function refreshAccessToken(refreshToken: string) {
  const stored = await RefreshTokenModel.findOne({
    tokenHash: hashToken(refreshToken),
  });

  if (!stored || stored.expiresAt <= new Date()) {
    throw AppError.unauthorized(
      "Refresh token is invalid or expired.",
      "INVALID_REFRESH_TOKEN",
    );
  }

  const claimed = await RefreshTokenModel.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { revokedAt: new Date() },
  );

  if (!claimed) {
    await revokeSessionById(stored.session);
    throw AppError.unauthorized(
      "Refresh token was already used.",
      "REFRESH_TOKEN_REUSED",
    );
  }

  const session = await SessionModel.findById(stored.session);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw AppError.unauthorized(
      "Session is no longer active.",
      "SESSION_REVOKED",
    );
  }

  const user = await UserModel.findById(stored.user);
  if (!user) {
    throw AppError.unauthorized("User no longer exists.", "USER_NOT_FOUND");
  }

  session.lastSeenAt = new Date();
  await session.save();

  const accessToken = await signAccessToken({
    id: user.id,
    role: user.role,
    sid: session.id,
  });
  const newRefreshToken = await issueRefreshToken(user.id, session.id);

  return { accessToken, refreshToken: newRefreshToken, user };
}

/* ---------- end sessions ---------- */

/** Revokes the session behind this refresh token. Safe to call repeatedly. */
export async function logoutSession(refreshToken: string) {
  const stored = await RefreshTokenModel.findOne({
    tokenHash: hashToken(refreshToken),
  });
  if (stored) {
    await revokeSessionById(stored.session);
  }
}

/** Revokes one of the user's own sessions. */
export async function revokeSession(userId: string, sessionId: string) {
  const owned = await SessionModel.exists({ _id: sessionId, user: userId });
  if (!owned) {
    throw AppError.notFound("Session not found.", "SESSION_NOT_FOUND");
  }
  await revokeSessionById(sessionId);
}

/** Revokes every active session (and refresh token) of the user. */
export async function revokeAllSessions(userId: string) {
  const now = new Date();
  await SessionModel.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: now },
  );
  const revoked = await SessionModel.find({ user: userId })
    .select("_id")
    .lean();
  await Promise.all(
    revoked.map((session) => deleteSessionSubscriptions(String(session._id))),
  );
  realtimeBus.emit("session.revoked", { userId });
  await RefreshTokenModel.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: now },
  );
}

/* ---------- queries ---------- */

export async function listActiveSessions(userId: string) {
  return SessionModel.find({
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ lastSeenAt: -1 });
}

/** Throws unless the session exists, is the user's, isn't revoked and hasn't expired. */
export async function assertSessionActive(userId: string, sessionId: string) {
  const active = await SessionModel.exists({
    _id: sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!active) {
    throw AppError.unauthorized(
      "Session is no longer active.",
      "SESSION_REVOKED",
    );
  }
}
