import type { Types } from "mongoose";
import { decryptText, encryptText } from "../../../shared/crypto/message-crypto.ts";
import { AppError } from "../../../shared/errors/app-error.ts";
import { logger } from "../../../shared/logger.ts";
import { verifyChatMedia } from "../../../shared/storage/storage.service.ts";
import { ConversationModel } from "../../conversations/models/conversation.model.ts";
import type { ConversationSide } from "../../conversations/services/receipt.service.ts";
import { MessageModel, type Message } from "../models/message.model.ts";
import type {
  ListMessagesQuery,
  SendMessageInput,
} from "../schemas/message.schemas.ts";
import { syncLastMessageAfterDelete, toLastMessage } from "./last-message.service.ts";
import { notifyMessageCreated } from "../../push/services/notifier.service.ts";

export type MessageDoc = Message & { _id: Types.ObjectId; createdAt: Date };

export async function getMessageOrThrow(id: string) {
  const message = await MessageModel.findById(id).lean<MessageDoc>();
  if (!message) {
    throw AppError.notFound("Message not found.", "MESSAGE_NOT_FOUND");
  }
  return message;
}

export async function getConversationUserId(conversationId: string) {
  const conversation = await ConversationModel.findById(conversationId)
    .select("userId")
    .lean();
  if (!conversation) {
    throw AppError.notFound(
      "Conversation not found.",
      "CONVERSATION_NOT_FOUND",
    );
  }
  return String(conversation.userId);
}

export async function listMessages(
  conversationId: string,
  { before, limit }: ListMessagesQuery,
) {
  const rows = await MessageModel.find({
    conversationId,
    ...(before ? { _id: { $lt: before } } : {}),
  })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean<MessageDoc[]>();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];

  return {
    messages: page,
    nextCursor: hasMore && oldest ? String(oldest._id) : null,
  };
}

export async function sendStoredMessage(
  senderId: string,
  conversationId: string,
  input: SendMessageInput,
  unreadSide?: ConversationSide | null,
) {
  if (input.replyToId) {
    const replyTo = await MessageModel.findById(input.replyToId)
      .lean<MessageDoc>();
    if (!replyTo || String(replyTo.conversationId) !== conversationId) {
      throw AppError.notFound(
        "Reply target not found.",
        "REPLY_TARGET_NOT_FOUND",
      );
    }
  }

  let type: "text" | "image" | "video" | "voice" = "text";
  let media:
    | {
        key: string;
        mimeType: string;
        size: number;
        originalName?: string;
        durationSec?: number;
        waveform?: number[];
      }
    | undefined;
  let content = input.text;

  if (input.attachment) {
    const checked = await verifyChatMedia(input.attachment.key, senderId);
    if (checked.kind !== input.attachment.kind) {
      throw AppError.validation({
        attachment: [
          {
            code: "MEDIA_KIND_MISMATCH",
            message: "Attachment kind does not match the stored file.",
          },
        ],
      });
    }

    type = checked.kind;
    if (input.attachment.kind === "voice") {
      if (input.text?.trim() || input.caption?.trim()) {
        throw AppError.validation({
          attachment: [
            {
              code: "VOICE_TEXT_NOT_ALLOWED",
              message: "Voice messages cannot include text or a caption.",
            },
          ],
        });
      }
      if (
        !(input.attachment.durationSec > 0)
      ) {
        throw AppError.validation({
          "attachment.durationSec": [
            {
              code: "INVALID_DURATION",
              message:
                "Voice duration must be greater than 0.",
            },
          ],
        });
      }
      if (
        input.attachment.waveform.length < 20 ||
        input.attachment.waveform.length > 80 ||
        !input.attachment.waveform.every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 100,
        )
      ) {
        throw AppError.validation({
          "attachment.waveform": [
            {
              code: "INVALID_WAVEFORM",
              message: "Waveform must contain 20 to 80 integers from 0 to 100.",
            },
          ],
        });
      }
      media = {
        key: checked.key,
        mimeType: checked.contentType,
        size: checked.size,
        durationSec: input.attachment.durationSec,
        waveform: input.attachment.waveform,
      };
      content = undefined;
    } else {
      media = {
        key: checked.key,
        mimeType: checked.contentType,
        size: checked.size,
        originalName: input.attachment.originalName,
      };
      content = input.caption?.trim() || undefined;
    }
  }

  const message = await MessageModel.create({
    conversationId,
    senderId,
    type,
    ...(content && { text: encryptText(content) }),
    ...(media && { media }),
    replyToId: input.replyToId ?? null,
  });
  const doc = message.toObject<MessageDoc>();

  try {
    const update = await ConversationModel.updateOne(
      {
        _id: conversationId,
        $or: [
          { lastMessageAt: { $exists: false } },
          { lastMessageAt: { $lte: doc.createdAt } },
        ],
      },
      {
        $set: { lastMessageAt: doc.createdAt, lastMessage: toLastMessage(doc) },
        ...(unreadSide && {
          $inc: {
            [unreadSide === "user" ? "userUnreadCount" : "ownerUnreadCount"]: 1,
          },
        }),
      },
    );
    if (update.matchedCount === 0 && unreadSide) {
      await ConversationModel.updateOne(
        { _id: conversationId },
        {
          $inc: {
            [unreadSide === "user" ? "userUnreadCount" : "ownerUnreadCount"]: 1,
          },
        },
      );
    }
  } catch (err) {
    logger.error(
      { err, conversationId, messageId: String(doc._id) },
      "Failed to update conversation last message",
    );
  }

  void notifyMessageCreated(doc);

  return doc;
}

const alreadyDeleted = () =>
  AppError.conflict("Message is deleted.", undefined, "MESSAGE_DELETED");

// Pushes the current text into editHistory and replaces it.
// The "text.iv" condition fails the update if the text changed since we read it.
export async function editMessageText(message: MessageDoc, newText: string) {
  if (message.deletedAt) throw alreadyDeleted();
  if (!message.text) {
    throw AppError.badRequest(
      "This message has no text to edit.",
      "NOT_EDITABLE",
    );
  }
  if (decryptText(message.text) === newText) return message;

  const encrypted = encryptText(newText);
  const now = new Date();

  const updated = await MessageModel.findOneAndUpdate(
    {
      _id: message._id,
      deletedAt: { $exists: false },
      "text.iv": message.text.iv,
    },
    {
      $set: { text: encrypted, editedAt: now },
      $push: { editHistory: { text: message.text, editedAt: now } },
    },
    { returnDocument: "after" },
  ).lean<MessageDoc>();

  if (!updated) {
    throw AppError.conflict(
      "Message was changed or deleted. Reload and try again.",
      undefined,
      "MESSAGE_CHANGED",
    );
  }

  // If it is the conversation's last message, update the mirror too.
  await ConversationModel.updateOne(
    { _id: updated.conversationId, "lastMessage.messageId": updated._id },
    { $set: { "lastMessage.text": encrypted } },
  );

  return updated;
}

export async function softDeleteMessage(message: MessageDoc) {
  if (message.deletedAt) return message;

  const updated = await MessageModel.findOneAndUpdate(
    { _id: message._id, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  ).lean<MessageDoc>();

  // Someone else deleted it a moment ago: return its current state.
  if (!updated) return getMessageOrThrow(String(message._id));

  await ConversationModel.updateOne(
    { _id: updated.conversationId, "lastMessage.messageId": updated._id },
    { $set: { "lastMessage.deletedAt": updated.deletedAt } },
  );

  return updated;
}

// Real removal. Media files stay in storage (by design).
export async function hardDeleteMessage(message: MessageDoc) {
  await MessageModel.deleteOne({ _id: message._id });
  await syncLastMessageAfterDelete(message.conversationId, message._id);
}

export async function clearConversationMessages(
  conversationId: string,
  resetReceipts: boolean,
) {
  await MessageModel.deleteMany({ conversationId });
  await ConversationModel.updateOne(
    { _id: conversationId },
    {
      $unset: { lastMessage: 1, lastMessageAt: 1 },
      ...(resetReceipts && {
        $set: {
          userDeliveredUpTo: null,
          userReadUpTo: null,
          ownerDeliveredUpTo: null,
          ownerReadUpTo: null,
          userUnreadCount: 0,
          ownerUnreadCount: 0,
        },
      }),
    },
  );
}

