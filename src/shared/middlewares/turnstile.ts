import type { Request, Response, NextFunction, RequestHandler } from "express";
import { env } from "../../config/env.ts";
import { AppError } from "../errors/app-error.ts";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CLOUDFLARE_TEST_PASS_SECRET = "1x0000000000000000000000000000000AA";
const USER_TEST_SECRET = "bc1qpjq2u4vwnyxe3u0flg8hfp3c8mfmd9f38ydu07";

interface TurnstileSiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Extracts Cloudflare Turnstile verification token from:
 * 1. HTTP header `cf-turnstile-response`
 * 2. Request body `turnstileToken` (purged from body after extraction)
 * 3. Request body `cf-turnstile-response` (purged from body after extraction)
 */
export function extractTurnstileToken(req: Request): string | undefined {
  // 1. Header extraction
  const headerVal = req.headers["cf-turnstile-response"];
  if (typeof headerVal === "string" && headerVal.trim().length > 0) {
    return headerVal.trim();
  }
  if (Array.isArray(headerVal)) {
    const first = headerVal[0];
    if (first && first.trim().length > 0) {
      return first.trim();
    }
  }

  // 2. Body extraction (clean up fields so strict schemas don't fail)
  const body = req.body as Record<string, unknown> | undefined;
  if (
    typeof body?.turnstileToken === "string" &&
    body.turnstileToken.trim().length > 0
  ) {
    const token = body.turnstileToken.trim();
    delete body.turnstileToken;
    return token;
  }

  if (
    typeof body?.["cf-turnstile-response"] === "string" &&
    (body["cf-turnstile-response"] as string).trim().length > 0
  ) {
    const token = (body["cf-turnstile-response"] as string).trim();
    delete body["cf-turnstile-response"];
    return token;
  }

  return undefined;
}

/**
 * Cloudflare Turnstile Verification Middleware
 * Validates human interactivity token on authentication endpoints.
 */
export const verifyTurnstile: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  // 1. Conditional bypass if disabled (e.g. dev/test)
  if (!env.TURNSTILE_ENABLED) {
    return next();
  }

  // 2. Extract token from header or body
  const token = extractTurnstileToken(req);

  // 3. Fast in-memory check without performing external HTTP call
  if (!token) {
    return next(
      AppError.forbidden(
        "Cloudflare Turnstile token is required.",
        "TURNSTILE_TOKEN_REQUIRED",
      ),
    );
  }

  // 4. Verify token via Cloudflare API
  // Map test dummy secret to Cloudflare's official testing pass secret
  const secretKey =
    env.TURNSTILE_SECRET_KEY === USER_TEST_SECRET
      ? CLOUDFLARE_TEST_PASS_SECRET
      : env.TURNSTILE_SECRET_KEY;

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: req.ip,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      req.log?.warn(
        { status: response.status },
        "Cloudflare Turnstile siteverify responded with non-200 status",
      );
      return next(
        AppError.forbidden(
          "Security challenge verification failed. Please try again.",
          "TURNSTILE_VERIFICATION_FAILED",
        ),
      );
    }

    const data = (await response.json()) as TurnstileSiteverifyResponse;

    if (!data.success) {
      req.log?.warn(
        { errorCodes: data["error-codes"] },
        "Cloudflare Turnstile verification challenge rejected",
      );
      return next(
        AppError.forbidden(
          "Cloudflare Turnstile verification failed. Please complete the security challenge.",
          "TURNSTILE_VERIFICATION_FAILED",
        ),
      );
    }

    return next();
  } catch (err: unknown) {
    req.log?.error(
      { err },
      "Cloudflare Turnstile verification request failed or timed out",
    );
    return next(
      AppError.forbidden(
        "Unable to verify security challenge at this time. Please try again.",
        "TURNSTILE_VERIFICATION_FAILED",
      ),
    );
  }
};
