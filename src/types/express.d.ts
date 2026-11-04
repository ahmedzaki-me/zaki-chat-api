import type { AuthUser } from "../modules/auth/services/token.service.ts";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
      user?: AuthUser;
    }
  }
}
