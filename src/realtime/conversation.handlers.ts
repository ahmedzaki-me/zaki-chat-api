import type { Socket } from "socket.io";
import { toPublicConversation } from "../modules/conversations/controllers/conversation.http.ts";
import {
  readConversationSchema,
  typingSchema,
} from "../modules/conversations/schemas/conversation.schemas.ts";
import {
  readConversation,
  sendTyping,
} from "../modules/conversations/services/conversation.actions.ts";
import { ClientEvents } from "./events.ts";
import { handle } from "./handler.ts";

export function registerConversationHandlers(socket: Socket) {
  handle(
    socket,
    ClientEvents.CONVERSATION_READ,
    readConversationSchema,
    async (auth, input) => {
      const conversation = await readConversation(
        auth,
        input.conversationId,
        input.messageId,
      );
      return { conversation: await toPublicConversation(conversation, auth) };
    },
  );

  handle(socket, ClientEvents.TYPING, typingSchema, async (auth, input) =>
    sendTyping(auth, input.conversationId, input.isTyping),
  );
}
