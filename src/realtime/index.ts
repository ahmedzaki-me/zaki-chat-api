import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.ts";
import type { AuthUser } from "../modules/auth/services/token.service.ts";
import { logger } from "../shared/logger.ts";
import { realtimeBus } from "./bus.ts";
import { registerConversationHandlers } from "./conversation.handlers.ts";
import { socketAuth } from "./auth.ts";
import { registerMessageHandlers } from "./message.handlers.ts";
import { startPublisher } from "./publisher.ts";
import { OWNER_ROOM, hasConnectedSockets, sessionRoom, userRoom } from "./rooms.ts";
import { markPendingDeliveredOnConnect } from "../modules/conversations/services/receipt.service.ts";
import { UserModel } from "../modules/users/models/user.model.ts";
import { registerConnection, removeConnection } from "./connection-registry.ts";
import { registerVisibilityHandler } from "./visibility.handlers.ts";

export function createRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    transports: ["websocket"], // the client must use transports: ["websocket"] too
    maxHttpBufferSize: 100_000, // same limit as express.json
  });

  io.use(socketAuth);
  startPublisher(io);

  io.on("connection", (socket) => {
    const auth = socket.data.auth as AuthUser;
    registerConnection(socket, auth.id);
    const wasOnline = hasConnectedSockets(io, userRoom(auth.id));

    const joinedRooms = [
      socket.join(userRoom(auth.id)),
      socket.join(sessionRoom(auth.sid)),
    ];
    if (auth.role === "owner") joinedRooms.push(socket.join(OWNER_ROOM));

    registerMessageHandlers(socket);
    registerConversationHandlers(socket);
    registerVisibilityHandler(socket);

    void Promise.all(joinedRooms)
      .then(async () => {
        try {
          if (auth.role === "owner") {
            const sockets = await io.fetchSockets();
            const onlineUserIds = [...new Set(
              sockets.flatMap((connectedSocket) => {
                const connectedAuth = connectedSocket.data.auth as AuthUser | undefined;
                return connectedAuth?.role === "user" ? [connectedAuth.id] : [];
              }),
            )];
            socket.emit("presence:snapshot", { onlineUserIds });
          } else if (!wasOnline) {
            const user = await UserModel.findById(auth.id).select("lastSeenAt").lean();
            realtimeBus.emit("presence.updated", {
              userId: auth.id,
              online: true,
              lastSeenAt: user?.lastSeenAt ?? null,
            });
          }
        } catch (err) {
          logger.error({ err, userId: auth.id }, "Failed to publish initial presence");
        }
        return markPendingDeliveredOnConnect(auth);
      })
      .then((conversationIds) => {
        for (const conversationId of conversationIds) {
          realtimeBus.emit("conversation.updated", conversationId);
        }
      })
      .catch((err) => {
        logger.error({ err, userId: auth.id }, "Failed to mark pending messages delivered");
      });

    logger.debug({ userId: auth.id }, "Socket connected");
    socket.on("disconnect", (reason) => {
      removeConnection(socket.id);
      logger.debug({ userId: auth.id, reason }, "Socket disconnected");
      if (auth.role === "user" && !hasConnectedSockets(io, userRoom(auth.id))) {
        const lastSeenAt = new Date();
        void UserModel.updateOne({ _id: auth.id }, { $set: { lastSeenAt } })
          .then(() => {
            realtimeBus.emit("presence.updated", {
              userId: auth.id,
              online: false,
              lastSeenAt,
            });
          })
          .catch((err) => {
            logger.error({ err, userId: auth.id }, "Failed to update last seen");
          });
      }
    });
  });

  return io;
}
