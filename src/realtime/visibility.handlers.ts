import type { Socket } from "socket.io";
import { z } from "zod";
import { ConversationModel } from "../modules/conversations/models/conversation.model.ts";
import { assertCan } from "../shared/permissions/policy.ts";
import { handle } from "./handler.ts";
import { updateSocketView } from "./connection-registry.ts";
import { ClientEvents } from "./events.ts";

const visibilitySchema = z.object({ visible: z.boolean(), conversationId: z.string().regex(/^[0-9a-f]{24}$/).optional() });
export function registerVisibilityHandler(socket: Socket) {
  handle(socket, ClientEvents.APP_VISIBILITY, visibilitySchema, async (auth, input) => {
    let activeConversationId: string | null = null;
    if (input.visible && input.conversationId) {
      const conversation = await ConversationModel.findById(input.conversationId).select("userId").lean();
      if (conversation) {
        try {
          assertCan(auth, "conversation:read", { conversationUserId: String(conversation.userId) });
          activeConversationId = input.conversationId;
        } catch { /* inaccessible conversation is silently ignored */ }
      }
    }
    updateSocketView(socket.id, { visible: input.visible, activeConversationId });
    return null;
  });
}
