import { Types } from "mongoose";
import { realtimeBus } from "../../../realtime/bus.ts";
import { AppError } from "../../../shared/errors/app-error.ts";
import { assertCan } from "../../../shared/permissions/policy.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";
import { notifyReactionAdded } from "../../push/services/notifier.service.ts";
import { MessageModel } from "../models/message.model.ts";
import {
  getConversationUserId,
  getMessageOrThrow,
  type MessageDoc,
} from "./message.service.ts";

// Idempotent: the same user + emoji is only stored once per message.
export async function addReaction(
  message: MessageDoc,
  userId: string,
  emoji: string,
) {
  if (message.deletedAt) {
    throw AppError.conflict(
      "Message is deleted.",
      undefined,
      "MESSAGE_DELETED",
    );
  }

  const uid = new Types.ObjectId(userId);

  await MessageModel.updateOne(
    {
      _id: message._id,
      deletedAt: { $exists: false },
      reactions: { $not: { $elemMatch: { userId: uid, emoji } } },
    },
    { $push: { reactions: { userId: uid, emoji, createdAt: new Date() } } },
  );

  return getMessageOrThrow(String(message._id));
}

// Only the caller's own reaction can be removed (userId always comes from auth).
export async function removeReaction(
  message: MessageDoc,
  userId: string,
  emoji: string,
) {
  await MessageModel.updateOne(
    { _id: message._id },
    { $pull: { reactions: { userId: new Types.ObjectId(userId), emoji } } },
  );

  return getMessageOrThrow(String(message._id));
}

export async function addMessageReaction(
  auth: AuthUser,
  id: string,
  emoji: string,
) {
  const message = await getMessageOrThrow(id);
  const conversationUserId = await getConversationUserId(
    String(message.conversationId),
  );
  assertCan(auth, "reaction:add", { conversationUserId });

  const alreadyPresent = message.reactions.some(
    (reaction) =>
      String(reaction.userId) === auth.id && reaction.emoji === emoji,
  );
  const updated = await addReaction(message, auth.id, emoji);
  if (!alreadyPresent) void notifyReactionAdded(message, auth.id, emoji);
  realtimeBus.emit("message.reacted", updated);
  return updated;
}

export async function removeMessageReaction(
  auth: AuthUser,
  id: string,
  emoji: string,
) {
  const message = await getMessageOrThrow(id);
  const conversationUserId = await getConversationUserId(
    String(message.conversationId),
  );
  assertCan(auth, "reaction:remove", { conversationUserId });

  const updated = await removeReaction(message, auth.id, emoji);
  realtimeBus.emit("message.reacted", updated);
  return updated;
}
