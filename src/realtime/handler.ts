import type { Socket } from "socket.io";
import type { ZodType, z } from "zod";
import { assertSessionActive } from "../modules/auth/services/session.service.ts";
import type { AuthUser } from "../modules/auth/services/token.service.ts";
import { AppError } from "../shared/errors/app-error.ts";
import { logger } from "../shared/logger.ts";
import { toAppError } from "../shared/middlewares/error-handler.ts";
import { SOCKET_EVENT_RATE_LIMITS } from "./rate-limit.config.ts";

type Ack = (response: unknown) => void;

export const getAuth = (socket: Socket) => socket.data.auth as AuthUser;

type EventRateLimit = { startedAt: number; count: number };

function eventRateGroup(event: string) {
  if (
    ["message:send", "message:edit", "message:delete", "message:delete-permanent"].includes(event) ||
    event.startsWith("reaction:")
  ) return "message" as const;
  if (event === "conversation:read") return "read" as const;
  if (event === "typing") return "typing" as const;
  return "other" as const;
}

function consumeEventRateLimit(socket: Socket, event: string) {
  const group = eventRateGroup(event);
  const limit = SOCKET_EVENT_RATE_LIMITS[group];
  const now = Date.now();
  const limits = (socket.data.eventRateLimits ??= {}) as Record<string, EventRateLimit>;
  const current = limits[group];
  if (!current || now - current.startedAt >= limit.windowMs) {
    limits[group] = { startedAt: now, count: 1 };
    return true;
  }
  if (current.count >= limit.max) return false;
  current.count += 1;
  return true;
}

// Ack shape: { ok: true, data } | { ok: false, error: <problem details> }
export function handle<S extends ZodType>(
  socket: Socket,
  event: string,
  schema: S,
  run: (auth: AuthUser, input: z.output<S>) => Promise<unknown>,
) {
  socket.on(event, async (payload: unknown, ack?: unknown) => {
    const reply: Ack = typeof ack === "function" ? (ack as Ack) : () => {};

    try {
      const auth = getAuth(socket);
      await assertSessionActive(auth.id, auth.sid); // logout / revoke applies immediately
      if (!consumeEventRateLimit(socket, event)) {
        if (event === "typing") {
          reply({ ok: true, data: null });
          return;
        }
        throw new AppError({
          status: 429,
          code: "RATE_LIMITED",
          title: "Too Many Requests",
          detail: "Too many socket events. Try again shortly.",
        });
      }
      const input = schema.parse(payload);
      reply({ ok: true, data: await run(auth, input) });
    } catch (err) {
      const appError = toAppError(err);
      if (appError.status >= 500) {
        logger.error({ err, event }, "Socket event failed");
      }
      reply({ ok: false, error: appError.toProblem(event) });
      if (appError.status === 401) socket.disconnect(true);
    }
  });
}
