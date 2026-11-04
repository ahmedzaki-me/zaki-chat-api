import { realtimeBus } from "../../../realtime/bus.ts";
import { assertCan } from "../../../shared/permissions/policy.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";
import {
  getAuthorizedConversation,
  isOwnerSelfConversation,
  pinConversation,
  unpinConversation,
} from "./conversation.service.ts";
import {
  markConversationRead,
  type ConversationSide,
} from "./receipt.service.ts";

export async function readConversation(
  auth: AuthUser,
  conversationId: string,
  messageId: string,
) {
  const conversation = await getAuthorizedConversation(
    auth,
    conversationId,
    "conversation:read",
  );

  const side: ConversationSide = auth.role === "owner" ? "owner" : "user";
  const result = await markConversationRead(conversation, side, messageId);
  if (result.changed) realtimeBus.emit("conversation.updated", conversationId);
  return result.conversation;
}

export async function sendTyping(
  auth: AuthUser,
  conversationId: string,
  isTyping: boolean,
) {
  const conversation = await getAuthorizedConversation(
    auth,
    conversationId,
    "conversation:read",
  );
  if (isOwnerSelfConversation(conversation)) return null;

  realtimeBus.emit("typing", {
    conversationId,
    isTyping,
    recipient:
      auth.role === "user"
        ? "owner"
        : { userId: String(conversation.userId._id) },
  });
  return null;
}

export async function pinChat(auth: AuthUser, id: string) {
  assertCan(auth, "conversation:pin");

  const conversation = await pinConversation(id);
  realtimeBus.emit("conversation.updated", id);
  return conversation;
}

export async function unpinChat(auth: AuthUser, id: string) {
  assertCan(auth, "conversation:pin");

  const conversation = await unpinConversation(id);
  realtimeBus.emit("conversation.updated", id);
  return conversation;
}
