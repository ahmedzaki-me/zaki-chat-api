import type { Types } from "mongoose";
import { AppError } from "../../../shared/errors/app-error.ts";
import { ConversationModel } from "../models/conversation.model.ts";
import {
  getConversationById,
  isOwnerSelfConversation,
  type ConversationWithUser,
} from "./conversation.service.ts";
import { MessageModel } from "../../messages/models/message.model.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";

export type ConversationSide = "user" | "owner";

const receiptFields = (side: ConversationSide) =>
  side === "user"
    ? ({
        delivered: "userDeliveredUpTo",
        read: "userReadUpTo",
        unread: "userUnreadCount",
      } as const)
    : ({
        delivered: "ownerDeliveredUpTo",
        read: "ownerReadUpTo",
        unread: "ownerUnreadCount",
      } as const);

export function getMessageRecipientSide(
  conversationUserId: string,
  senderId: string,
): ConversationSide {
  const senderSide = conversationUserId === senderId ? "user" : "owner";
  return senderSide === "user" ? "owner" : "user";
}

export async function recalculateUnread(
  conversation: ConversationWithUser,
  side: ConversationSide,
) {
  if (isOwnerSelfConversation(conversation)) {
    return { conversation, changed: false };
  }

  const fields = receiptFields(side);
  const readUpTo = conversation[fields.read];
  const count = await MessageModel.countDocuments({
    conversationId: conversation._id,
    senderId:
      side === "user"
        ? { $ne: conversation.userId._id }
        : conversation.userId._id,
    ...(readUpTo ? { _id: { $gt: readUpTo } } : {}),
    deletedAt: null,
  });

  if ((conversation[fields.unread] ?? 0) === count) {
    return { conversation, changed: false };
  }

  const result = await ConversationModel.updateOne(
    { _id: conversation._id, [fields.read]: readUpTo ?? null },
    { $set: { [fields.unread]: count } },
  );
  return {
    conversation: await getConversationById(String(conversation._id)),
    changed: result.modifiedCount > 0,
  };
}

/**
 * Atomically decrements unreadCount if the deleted message was after the reader's read marker,
 * avoiding race conditions with concurrent message delivery.
 */
export async function decrementUnreadIfUnread(
  conversation: ConversationWithUser,
  readerSide: ConversationSide,
  messageId: Types.ObjectId,
) {
  if (isOwnerSelfConversation(conversation)) {
    return { conversation, changed: false };
  }

  const fields = receiptFields(readerSide);
  const readUpTo = conversation[fields.read];

  if (!readUpTo || messageId.toString() > readUpTo.toString()) {
    const update = await ConversationModel.updateOne(
      { _id: conversation._id, [fields.unread]: { $gt: 0 } },
      { $inc: { [fields.unread]: -1 } },
    );
    if (update.modifiedCount > 0) {
      return {
        conversation: await getConversationById(String(conversation._id)),
        changed: true,
      };
    }
  }

  return { conversation, changed: false };
}

export async function markConversationRead(
  conversation: ConversationWithUser,
  side: ConversationSide,
  messageId: string,
) {
  const message = await MessageModel.findById(messageId)
    .select("conversationId")
    .lean<{ _id: Types.ObjectId; conversationId: Types.ObjectId }>();
  if (!message || !message.conversationId.equals(conversation._id)) {
    throw AppError.notFound("Message not found.", "MESSAGE_NOT_FOUND");
  }

  if (isOwnerSelfConversation(conversation)) {
    return { conversation, changed: false };
  }

  const fields = receiptFields(side);
  const isUpToDate =
    conversation.lastMessage?.messageId &&
    message._id.equals(conversation.lastMessage.messageId);

  // If reading up to the latest message, atomically zero unreadCount in the same write
  const update = await ConversationModel.updateOne(
    { _id: conversation._id },
    {
      $max: {
        [fields.read]: message._id,
        [fields.delivered]: message._id,
      },
      ...(isUpToDate ? { $set: { [fields.unread]: 0 } } : {}),
    },
  );

  let current = await getConversationById(String(conversation._id));
  let changed = update.modifiedCount > 0;

  if (!isUpToDate) {
    const recalculated = await recalculateUnread(current, side);
    current = recalculated.conversation;
    changed = changed || recalculated.changed;
  }

  return {
    conversation: current,
    changed,
  };
}

export async function markDelivered(
  conversation: ConversationWithUser,
  side: ConversationSide,
  messageId: Types.ObjectId,
) {
  if (isOwnerSelfConversation(conversation)) return false;

  const { delivered } = receiptFields(side);
  const result = await ConversationModel.updateOne(
    { _id: conversation._id },
    { $max: { [delivered]: messageId } },
  );
  return result.modifiedCount > 0;
}

type DeliveryConversation = {
  _id: Types.ObjectId;
  userId: { _id: Types.ObjectId; role: string };
  lastMessage?: { messageId: Types.ObjectId };
  userDeliveredUpTo?: Types.ObjectId | null;
  ownerDeliveredUpTo?: Types.ObjectId | null;
};

export async function markPendingDeliveredOnConnect(auth: AuthUser) {
  const side: ConversationSide = auth.role === "owner" ? "owner" : "user";
  const { delivered } = receiptFields(side);
  const conversations = await ConversationModel.find(
    auth.role === "owner" ? {} : { userId: auth.id },
  )
    .select("userId lastMessage userDeliveredUpTo ownerDeliveredUpTo")
    .populate("userId", "role")
    .lean<DeliveryConversation[]>();

  const pending = conversations.flatMap((conversation) => {
    if (!conversation.lastMessage || isOwnerSelfConversation(conversation)) {
      return [];
    }

    const target = conversation.lastMessage.messageId;
    const previous =
      side === "owner"
        ? conversation.ownerDeliveredUpTo
        : conversation.userDeliveredUpTo;
    if (previous && previous.toString() >= target.toString()) return [];

    return [
      {
        id: conversation._id,
        target,
        previous,
      },
    ];
  });

  if (pending.length === 0) return [];

  const result = await ConversationModel.bulkWrite(
    pending.map(({ id, target, previous }) => ({
      updateOne: {
        filter: {
          _id: id,
          [delivered]: previous ?? null,
        },
        update: { $max: { [delivered]: target } },
      },
    })),
  );

  return result.modifiedCount > 0 ? pending.map(({ id }) => String(id)) : [];
}
