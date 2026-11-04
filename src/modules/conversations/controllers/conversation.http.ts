import { decryptText } from "../../../shared/crypto/message-crypto.ts";
import { can } from "../../../shared/permissions/policy.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";
import { toAvatarUrl } from "../../users/controllers/user.http.ts";
import { toMediaUrl } from "../../messages/controllers/message.http.ts";
import {
  getOwnerProfile,
  isOwnerSelfConversation,
  type ConversationWithUser,
} from "../services/conversation.service.ts";

type LastMessageSource = NonNullable<ConversationWithUser["lastMessage"]>;

async function toPublicLastMessage(m: LastMessageSource, auth: AuthUser) {
  const base = {
    id: String(m.messageId),
    senderId: String(m.senderId),
    type: m.type,
    deletedAt: m.deletedAt ?? null,
  };

  if (m.deletedAt && !can(auth, "message:view-deleted")) {
    return { ...base, text: null, durationSec: null, media: null };
  }

  return {
    ...base,
    text: m.text ? decryptText(m.text) : null,
    durationSec: m.durationSec ?? null,
    media: m.media ? await toMediaUrl(m.media) : null,
  };
}

export const toPublicConversation = async (
  c: ConversationWithUser,
  auth: AuthUser,
) => {
  const ownSide = auth.role === "owner" ? "owner" : "user";
  const peerSide = ownSide === "owner" ? "user" : "owner";
  const isSelfConversation = isOwnerSelfConversation(c);
  const ownUnreadCount =
    ownSide === "owner" ? c.ownerUnreadCount : c.userUnreadCount;
  const peerDeliveredUpTo =
    peerSide === "owner" ? c.ownerDeliveredUpTo : c.userDeliveredUpTo;
  const peerReadUpTo = peerSide === "owner" ? c.ownerReadUpTo : c.userReadUpTo;
  const owner = auth.role === "owner" ? undefined : await getOwnerProfile();

  return {
    id: String(c._id),
    createdAt: c.createdAt,
    user: {
      id: String(c.userId._id),
      name: c.userId.name,
      username: c.userId.username ?? null,
      avatarUrl: await toAvatarUrl(c.userId.avatarKey),
      ...(auth.role === "owner" && { lastSeenAt: c.userId.lastSeenAt ?? null }),
    },
    ...(auth.role !== "owner" && {
      owner: owner
        ? {
            name: owner.name,
            avatarUrl: await toAvatarUrl(owner.avatarKey),
          }
        : null,
    }),
    lastMessageAt: c.lastMessageAt ?? null,
    lastMessage: c.lastMessage
      ? await toPublicLastMessage(c.lastMessage, auth)
      : null,
    pinnedAt: c.pinnedAt ?? null,
    unreadCount: isSelfConversation ? 0 : (ownUnreadCount ?? 0),
    peerDeliveredUpTo: isSelfConversation
      ? null
      : (peerDeliveredUpTo?.toString() ?? null),
    peerReadUpTo: isSelfConversation
      ? null
      : (peerReadUpTo?.toString() ?? null),
  };
};
