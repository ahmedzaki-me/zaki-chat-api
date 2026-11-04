import type { Server } from "socket.io";
import type { AuthUser } from "../modules/auth/services/token.service.ts";
import { toPublicConversation } from "../modules/conversations/controllers/conversation.http.ts";
import {
  getConversationById,
  isOwnerSelfConversation,
  type ConversationWithUser,
} from "../modules/conversations/services/conversation.service.ts";
import {
  toMediaUrl,
  toPublicMessage,
} from "../modules/messages/controllers/message.http.ts";
import { logger } from "../shared/logger.ts";
import { realtimeBus } from "./bus.ts";
import { ServerEvents } from "./events.ts";
import {
  hasConnectedSockets,
  OWNER_ROOM,
  sessionRoom,
  userRoom,
} from "./rooms.ts";
import {
  getMessageRecipientSide,
  markDelivered,
} from "../modules/conversations/services/receipt.service.ts";

// Payload shaping depends only on the role, so we use two role-only viewers:
// the owner sees everything, the user gets the placeholders (same rules as REST).
const OWNER_VIEWER: AuthUser = { id: "owner-room", role: "owner", sid: "room" };
const USER_VIEWER: AuthUser = { id: "user-room", role: "user", sid: "room" };

// Listeners run async; a failure must be logged, never crash the process.
const run = (event: string, task: () => Promise<void>) => {
  task().catch((err) =>
    logger.error({ err, event }, "Realtime publish failed"),
  );
};

export function startPublisher(io: Server) {
  realtimeBus.on("session.revoked", ({ userId, sessionId }) => {
    const target = sessionId ? sessionRoom(sessionId) : userRoom(userId);
    io.in(target).disconnectSockets(true);
  });

  realtimeBus.on("presence.updated", ({ userId, online, lastSeenAt }) => {
    io.to(OWNER_ROOM).emit(ServerEvents.PRESENCE_UPDATED, {
      userId,
      online,
      lastSeenAt,
    });
  });

  realtimeBus.on("typing", ({ conversationId, isTyping, recipient }) => {
    const target =
      recipient === "owner" ? OWNER_ROOM : userRoom(recipient.userId);
    io.to(target).emit(ServerEvents.TYPING, { conversationId, isTyping });
  });

  // The owner's sockets get the owner payload; the conversation's user gets the
  // user payload. `except` stops a socket in both rooms from receiving it twice.
  const toBoth = async (
    conversationUserId: string,
    event: string,
    build: (viewer: AuthUser) => unknown | Promise<unknown>,
  ) => {
    io.to(OWNER_ROOM).emit(event, await build(OWNER_VIEWER));
    io.to(userRoom(conversationUserId))
      .except(OWNER_ROOM)
      .emit(event, await build(USER_VIEWER));
  };

  const emitConversation = (conversation: ConversationWithUser) =>
    toBoth(
      String(conversation.userId._id),
      ServerEvents.CONVERSATION_UPDATED,
      async (viewer) => ({
        conversation: await toPublicConversation(conversation, viewer),
      }),
    );

  realtimeBus.on("message.created", (message) =>
    run("message.created", async () => {
      const conversation = await getConversationById(
        String(message.conversationId),
      );
      const precomputedMedia = message.media
        ? await toMediaUrl(message.media)
        : null;
      await toBoth(
        String(conversation.userId._id),
        ServerEvents.MESSAGE_NEW,
        async (viewer) => ({
          message: await toPublicMessage(message, viewer, precomputedMedia),
        }),
      );
      let latestConversation = conversation;
      if (!isOwnerSelfConversation(conversation)) {
        const recipientSide = getMessageRecipientSide(
          String(conversation.userId._id),
          String(message.senderId),
        );
        const recipientRoom =
          recipientSide === "owner"
            ? OWNER_ROOM
            : userRoom(String(conversation.userId._id));
        if (
          hasConnectedSockets(io, recipientRoom) &&
          (await markDelivered(conversation, recipientSide, message._id))
        ) {
          latestConversation = await getConversationById(
            String(message.conversationId),
          );
        }
      }
      await emitConversation(latestConversation);
    }),
  );

  realtimeBus.on("message.updated", (message) =>
    run("message.updated", async () => {
      const conversation = await getConversationById(
        String(message.conversationId),
      );
      const precomputedMedia = message.media
        ? await toMediaUrl(message.media)
        : null;
      await toBoth(
        String(conversation.userId._id),
        ServerEvents.MESSAGE_UPDATED,
        async (viewer) => ({
          message: await toPublicMessage(message, viewer, precomputedMedia),
        }),
      );
      await emitConversation(conversation); // the last-message preview may have changed
    }),
  );

  realtimeBus.on("message.reacted", (message) =>
    run("message.reacted", async () => {
      const conversation = await getConversationById(
        String(message.conversationId),
      );
      const precomputedMedia = message.media
        ? await toMediaUrl(message.media)
        : null;
      await toBoth(
        String(conversation.userId._id),
        ServerEvents.MESSAGE_UPDATED,
        async (viewer) => ({
          message: await toPublicMessage(message, viewer, precomputedMedia),
        }),
      );
    }),
  );

  realtimeBus.on("message.deleted", (ref) =>
    run("message.deleted", async () => {
      const conversation = await getConversationById(ref.conversationId);
      await toBoth(
        String(conversation.userId._id),
        ServerEvents.MESSAGE_DELETED,
        () => ref,
      );
      await emitConversation(conversation);
    }),
  );

  realtimeBus.on("conversation.cleared", (conversationId) =>
    run("conversation.cleared", async () => {
      const conversation = await getConversationById(conversationId);
      await toBoth(
        String(conversation.userId._id),
        ServerEvents.CONVERSATION_CLEARED,
        () => ({
          conversationId,
        }),
      );
      await emitConversation(conversation);
    }),
  );

  realtimeBus.on("conversation.updated", (conversationId) =>
    run("conversation.updated", async () => {
      await emitConversation(await getConversationById(conversationId));
    }),
  );
}
