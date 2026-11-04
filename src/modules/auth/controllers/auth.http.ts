import type { CookieOptions, Request, Response } from "express";
import { env } from "../../../config/env.ts";
import type { User } from "../../users/models/user.model.ts";
import { toAvatarUrl } from "../../users/controllers/user.http.ts";
import { REFRESH_TOKEN_TTL_MS } from "../services/refresh-token.service.ts";
import type { SessionMeta } from "../services/session.service.ts";

/* ---------- refresh cookie ---------- */

export const REFRESH_COOKIE_NAME = "zaki_chat_refresh_token";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/v1/auth",
};

const refreshCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: REFRESH_TOKEN_TTL_MS,
};

export function getRefreshCookie(req: Request) {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  return typeof token === "string" && token ? token : undefined;
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions);
}

/* ---------- request / response shaping ---------- */

export const sessionMeta = (req: Request): SessionMeta => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
  previousRefreshToken: getRefreshCookie(req),
});

type PublicUserSource = {
  id: string;
  name: string;
  role: User["role"];
  username?: string | null;
  avatarKey?: string | null;
};

export const toPublicUser = async (u: PublicUserSource) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  username: u.username ?? null,
  avatarUrl: await toAvatarUrl(u.avatarKey),
});

type PublicSessionSource = {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  lastSeenAt: Date;
};

export const toPublicSession = (
  s: PublicSessionSource,
  currentSessionId: string,
) => ({
  id: s.id,
  ip: s.ip ?? null,
  userAgent: s.userAgent ?? null,
  createdAt: s.createdAt,
  lastSeenAt: s.lastSeenAt,
  isCurrent: s.id === currentSessionId,
});

export async function sendSession(
  res: Response,
  status: number,
  s: { user: PublicUserSource; accessToken: string; refreshToken: string },
) {
  res.cookie(REFRESH_COOKIE_NAME, s.refreshToken, refreshCookieOptions);
  res.status(status).json({
    accessToken: s.accessToken,
    user: await toPublicUser(s.user),
  });
}
