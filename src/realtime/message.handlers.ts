import type { Socket } from "socket.io";
import { conversationRefSchema } from "../modules/conversations/schemas/conversation.schemas.ts";
import { toPublicMessage } from "../modules/messages/controllers/message.http.ts";
import {
  messageIdParamsSchema,
  socketEditMessageSchema,
  socketSendMessageSchema,
} from "../modules/messages/schemas/message.schemas.ts";
import { reactionParamsSchema } from "../modules/messages/schemas/reaction.schemas.ts";
import {
  clearConversation,
  deleteMessage,
  deleteMessagePermanently,
  editMessage,
  sendMessage,
} from "../modules/messages/services/message.actions.ts";
import {
  addMessageReaction,
  removeMessageReaction,
} from "../modules/messages/services/reaction.service.ts";
import { ClientEvents } from "./events.ts";
import { handle } from "./handler.ts";

export function registerMessageHandlers(socket: Socket) {
  handle(
    socket,
    ClientEvents.MESSAGE_SEND,
    socketSendMessageSchema,
    async (auth, input) => {
      const message = await sendMessage(auth, input.conversationId, input);
      return { message: await toPublicMessage(message, auth) };
    },
  );

  handle(
    socket,
    ClientEvents.MESSAGE_EDIT,
    socketEditMessageSchema,
    async (auth, input) => {
      const message = await editMessage(auth, input.id, input.text);
      return { message: await toPublicMessage(message, auth) };
    },
  );

  handle(
    socket,
    ClientEvents.MESSAGE_DELETE,
    messageIdParamsSchema,
    async (auth, input) => {
      const message = await deleteMessage(auth, input.id);
      return { message: await toPublicMessage(message, auth) };
    },
  );

  handle(
    socket,
    ClientEvents.MESSAGE_DELETE_PERMANENT,
    messageIdParamsSchema,
    async (auth, input) => {
      await deleteMessagePermanently(auth, input.id);
      return null;
    },
  );

  handle(
    socket,
    ClientEvents.REACTION_ADD,
    reactionParamsSchema,
    async (auth, input) => {
      const message = await addMessageReaction(auth, input.id, input.emoji);
      return { message: await toPublicMessage(message, auth) };
    },
  );

  handle(
    socket,
    ClientEvents.REACTION_REMOVE,
    reactionParamsSchema,
    async (auth, input) => {
      const message = await removeMessageReaction(auth, input.id, input.emoji);
      return { message: await toPublicMessage(message, auth) };
    },
  );

  handle(
    socket,
    ClientEvents.CONVERSATION_CLEAR,
    conversationRefSchema,
    async (auth, input) => {
      await clearConversation(auth, input.conversationId);
      return null;
    },
  );
}
