import { SignJWT, jwtVerify, errors } from "jose";
import { env } from "../../../config/env.ts";
import { AppError } from "../../../shared/errors/app-error.ts";
import { USER_ROLES, type User } from "../../users/models/user.model.ts";

export type AuthUser = { id: string; role: User["role"]; sid: string };

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signAccessToken(user: AuthUser) {
  return new SignJWT({ role: user.role, sid: user.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      algorithms: ["HS256"],
    });

    const role = USER_ROLES.find((r) => r === payload.role);

    if (!payload.sub || !role || typeof payload.sid !== "string") {
      throw new errors.JWTInvalid("Invalid payload");
    }

    return { id: payload.sub, role, sid: payload.sid };
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      console.log(err);
      throw AppError.unauthorized("Access token has expired.", "TOKEN_EXPIRED");
    }
    throw AppError.unauthorized("Access token is invalid.", "INVALID_TOKEN");
  }
}
