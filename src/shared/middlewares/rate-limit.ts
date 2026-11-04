import type { Request } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { AppError } from "../errors/app-error.ts";

/**
 * Smart key generator for rate limiting:
 * 1. Authenticated user (post-JWT decode) -> user:{req.user.id}
 * 2. Unauthenticated with request body identifier -> account:{username}
 * 3. Fallback to client IP (IPv6 subnet normalized)
 */
export function smartKeyGenerator(req: Request): string {
  // 1. Authenticated user
  const userId = req.user?.id ?? req.auth?.id;
  if (userId) {
    return `user:${userId}`;
  }

  // 2. Unauthenticated request with identifier in body
  const body = req.body as Record<string, unknown> | undefined;
  const rawIdentifier =
    typeof body?.username === "string" ? body.username : undefined;

  if (rawIdentifier && rawIdentifier.trim().length > 0) {
    return `account:${rawIdentifier.toLowerCase().trim()}`;
  }

  // 3. Fallback to IP address (IPv6 subnet normalized)
  const rawIp = req.ip ?? req.socket?.remoteAddress ?? "127.0.0.1";
  return ipKeyGenerator(rawIp);
}

/**
 * 1. globalAuthLimiter: Circuit breaker against rotating proxy attacks
 * Window: 1 minute | Max: 150 requests across the entire route
 */
export const globalAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => "global_auth_limit",
  handler: (_req, _res, next) => {
    next(
      AppError.tooManyRequests(
        "High traffic detected on authentication service. Please wait a minute and try again.",
        "GLOBAL_AUTH_RATE_LIMITED",
      ),
    );
  },
});

/**
 * 2. ipAuthLimiter: Per-IP protection for authentication routes
 * Window: 15 minutes | Max: 15 attempts per IP
 */
export const ipAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "127.0.0.1"),
  handler: (_req, _res, next) => {
    next(
      AppError.tooManyRequests(
        "Too many authentication attempts from this IP address. Please try again after 15 minutes.",
        "IP_AUTH_RATE_LIMITED",
      ),
    );
  },
});

/**
 * 3. strictAccountLimiter: Protection against brute-force / credential stuffing
 * Window: 15 minutes | Max: 5 attempts | Counts ONLY failed requests
 */
export const strictAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: smartKeyGenerator,
  handler: (_req, _res, next) => {
    next(
      AppError.tooManyRequests(
        "Too many failed login attempts for this account. Please try again after 15 minutes.",
        "ACCOUNT_RATE_LIMITED",
      ),
    );
  },
});

/**
 * 4. generalApiLimiter: Standard REST API protection
 * Window: 1 minute | Max: 60 requests per user/IP
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: smartKeyGenerator,
  handler: (_req, _res, next) => {
    next(
      AppError.tooManyRequests(
        "Too many requests. Please slow down and try again later.",
        "RATE_LIMITED",
      ),
    );
  },
});
