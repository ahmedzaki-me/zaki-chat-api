import { createHash, randomBytes } from "node:crypto";
import { RefreshTokenModel } from "../models/refresh-token.model.ts";

export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId: string, sessionId: string) {
  const token = randomBytes(32).toString("base64url");

  await RefreshTokenModel.create({
    user: userId,
    session: sessionId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return token;
}
