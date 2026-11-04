import { realtimeBus } from "../../../realtime/bus.ts";
import { assertCan } from "../../../shared/permissions/policy.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";
import {
  getAuthorizedConversation,
  getConversationById,
  isOwnerSelfConversation,
} from "../../conversations/services/conversation.service.ts";
import {
  decrementUnreadIfUnread,
  getMessageRecipientSide,
} from "../../conversations/services/receipt.service.ts";
import {
  clearConversationMessages,
  editMessageText,
  getMessageOrThrow,
  hardDeleteMessage,
  sendStoredMessage,
  softDeleteMessage,
} from "./message.service.ts";

export async function sendMessage(
  auth: AuthUser,
  conversationId: string,
  input: import("../schemas/message.schemas.ts").SendMessageInput,
) {
  const conversation = await getAuthorizedConversation(
    auth,
    conversationId,
    "message:send",
  );
  const conversationUserId = String(conversation.userId._id);

  const recipientSide = isOwnerSelfConversation(conversation)
    ? null
    : getMessageRecipientSide(conversationUserId, auth.id);
  const message = await sendStoredMessage(
    auth.id,
    conversationId,
    input,
    recipientSide,
  );
  realtimeBus.emit("message.created", message);
  return message;
}

export async function editMessage(auth: AuthUser, id: string, text: string) {
  const message = await getMessageOrThrow(id);
  assertCan(auth, "message:edit", { senderId: String(message.senderId) });

  const updated = await editMessageText(message, text);
  if (updated !== message) realtimeBus.emit("message.updated", updated); // skip no-op edits
  return updated;
}

export async function deleteMessage(auth: AuthUser, id: string) {
  const message = await getMessageOrThrow(id);
  assertCan(auth, "message:delete", { senderId: String(message.senderId) });

  const updated = await softDeleteMessage(message);
  if (updated !== message) {
    const conversation = await getConversationById(
      String(updated.conversationId),
    );
    const readerSide = isOwnerSelfConversation(conversation)
      ? null
      : getMessageRecipientSide(
          String(conversation.userId._id),
          String(updated.senderId),
        );
    if (readerSide) {
      await decrementUnreadIfUnread(conversation, readerSide, updated._id);
    }
    realtimeBus.emit("message.updated", updated);
  }
  return updated;
}

export async function deleteMessagePermanently(auth: AuthUser, id: string) {
  assertCan(auth, "message:delete-permanent"); // before loading: users always get 403

  const message = await getMessageOrThrow(id);
  await hardDeleteMessage(message);
  const conversation = await getConversationById(
    String(message.conversationId),
  );
  if (!isOwnerSelfConversation(conversation)) {
    const readerSide = getMessageRecipientSide(
      String(conversation.userId._id),
      String(message.senderId),
    );
    await decrementUnreadIfUnread(conversation, readerSide, message._id);
  }
  realtimeBus.emit("message.deleted", {
    id: String(message._id),
    conversationId: String(message.conversationId),
  });
}

export async function clearConversation(
  auth: AuthUser,
  conversationId: string,
) {
  assertCan(auth, "conversation:clear");

  const conversation = await getConversationById(conversationId);
  await clearConversationMessages(
    conversationId,
    !isOwnerSelfConversation(conversation),
  );
  realtimeBus.emit("conversation.cleared", conversationId);
}
