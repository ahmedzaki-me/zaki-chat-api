import type { Server } from "socket.io";
import { assertSessionActive } from "../modules/auth/services/session.service.ts";
import { verifyAccessToken } from "../modules/auth/services/token.service.ts";
import { AppError } from "../shared/errors/app-error.ts";
import { toAppError } from "../shared/middlewares/error-handler.ts";

// Handshake auth: io(url, { auth: { token } }).
// On failure the client gets `connect_error` with err.data = { code, status }
// (e.g. TOKEN_EXPIRED -> refresh the token over REST, then reconnect).
export const socketAuth: Parameters<Server["use"]>[0] = async (
  socket,
  next,
) => {
  try {
    const token: unknown = socket.handshake.auth.token;
    if (typeof token !== "string" || !token) {
      throw AppError.unauthorized("Missing access token.", "MISSING_TOKEN");
    }

    const auth = await verifyAccessToken(token);
    await assertSessionActive(auth.id, auth.sid);

    socket.data.auth = auth;
    next();
  } catch (err) {
    const appError = toAppError(err);
    next(
      Object.assign(new Error(appError.detail), {
        data: { code: appError.code, status: appError.status },
      }),
    );
  }
};
