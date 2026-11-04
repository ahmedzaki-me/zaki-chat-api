import type { Types } from "mongoose";
import { ConversationModel } from "../../conversations/models/conversation.model.ts";
import { MessageModel } from "../models/message.model.ts";
import type { MessageDoc } from "./message.service.ts";

// The shape stored in conversation.lastMessage (encrypted text copied as is).
export function toLastMessage(m: MessageDoc) {
  return {
    messageId: m._id,
    senderId: m.senderId,
    type: m.type,
    ...(m.text && { text: m.text }),
    ...(m.media && { media: { key: m.media.key, originalName: m.media.originalName, mimeType: m.media.mimeType, size: m.media.size, kind: m.type } }),
    ...(m.media?.durationSec != null && { durationSec: m.media.durationSec }),
    ...(m.deletedAt && { deletedAt: m.deletedAt }),
  };
}

// After a hard delete: if the removed message was the conversation's last one,
// point lastMessage at the newest remaining message (or clear it if none is left).
export async function syncLastMessageAfterDelete(
  conversationId: Types.ObjectId,
  deletedMessageId: Types.ObjectId,
) {
  const wasLast = await ConversationModel.exists({
    _id: conversationId,
    "lastMessage.messageId": deletedMessageId,
  });
  if (!wasLast) return;

  const latest = await MessageModel.findOne({ conversationId })
    .sort({ _id: -1 })
    .lean<MessageDoc>();

  if (!latest) {
    await ConversationModel.updateOne(
      { _id: conversationId },
      { $unset: { lastMessage: 1, lastMessageAt: 1 } },
    );
    return;
  }

  await ConversationModel.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessageAt: latest.createdAt,
        lastMessage: toLastMessage(latest),
      },
    },
  );
}
