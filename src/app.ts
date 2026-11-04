import express, { Router } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.ts";
import { logger } from "./shared/logger.ts";
import { notFound } from "./shared/middlewares/not-found.ts";
import { errorHandler } from "./shared/middlewares/error-handler.ts";

import { docsRouter } from "./modules/docs/docs.routes.ts";
import { authRouter } from "./modules/auth/routes/auth.routes.ts";
import { conversationsRouter } from "./modules/conversations/routes/conversation.routes.ts";
import { messageItemRouter } from "./modules/messages/routes/message-item.routes.ts";
import { uploadsRouter } from "./modules/uploads/routes/upload.routes.ts";
import { usersRouter } from "./modules/users/routes/user.routes.ts";
import { pushRouter } from "./modules/push/routes/push.routes.ts";

export const app = express();
// Trust first proxy hop (reverse proxy, Cloudflare, etc.) to correctly resolve client IP addresses
app.set("trust proxy", 1);

const v1Router = Router();

// HTTP Request Logging
app.use(
  pinoHttp({
    logger,
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === "/health" },
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500
        ? "error"
        : res.statusCode >= 400
          ? "warn"
          : "info",
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`,
  }),
);

// Security & Parsing Middlewares
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
app.use(cookieParser());

// Backward-compatibility redirect for legacy Swagger UI path
app.use("/api/docs", (_req, res) => {
  res.redirect(301, "/docs");
});

// Interactive Documentation (Swagger UI on /docs, Socket.IO AsyncAPI on /docs/socket)
app.use(docsRouter);

// Health check and root ping
app.get("/", (_req, res) => {
  res.send("Hello world");
});

app.get("/health", (_req, res) => {
  const isDbUp = mongoose.connection.readyState === 1;
  res.status(isDbUp ? 200 : 503).json({
    status: isDbUp ? "ok" : "degraded",
    db: isDbUp ? "up" : "down",
  });
});

// Mount API v1 Routers
v1Router.use("/auth", authRouter);
v1Router.use("/conversations", conversationsRouter);
v1Router.use("/messages", messageItemRouter);
v1Router.use("/uploads", uploadsRouter);
v1Router.use("/users", usersRouter);
v1Router.use("/push", pushRouter);

app.use("/api/v1", v1Router);

// Fallthrough & Error Handlers
app.use(notFound);
app.use(errorHandler);
