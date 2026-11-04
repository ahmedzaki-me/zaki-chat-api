import mongoose from "mongoose";
import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { createRealtime } from "./realtime/index.ts";
import { logger } from "./shared/logger.ts";

async function main() {
  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });
  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB connection disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    logger.info("MongoDB connection re-established");
  });

  await mongoose.connect(env.MONGODB_URI);
  logger.info("MongoDB connected");

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server listening");
  });
  const io = createRealtime(server);

  let isShuttingDown = false;

  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`${signal} received, shutting down...`);

    setTimeout(() => {
      console.error("Graceful shutdown timed out");
      process.exit(1);
    }, 10_000).unref();

    // io.close() disconnects every socket, then closes the HTTP server
    io.close(async (serverError) => {
      let exitCode = 0;

      if (serverError) {
        console.error("Server shutdown failed:", serverError);
        exitCode = 1;
      }

      try {
        await mongoose.disconnect();
      } catch (err) {
        console.error("Database shutdown failed:", err);
        exitCode = 1;
      }

      process.exit(exitCode);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start");
  process.exit(1);
});
