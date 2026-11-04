import { decryptText } from "../../../shared/crypto/message-crypto.ts";
import { can } from "../../../shared/permissions/policy.ts";
import { createDownloadUrl } from "../../../shared/storage/storage.service.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";
import type { MessageDoc } from "../services/message.service.ts";

type StoredMedia = NonNullable<MessageDoc["media"]>;

export type PublicMedia = {
  url: string;
  kind: "voice" | "video" | "image";
  mimeType: string;
  size: number;
  originalName?: string;
  durationSec?: number;
  waveform?: number[];
} | null;

export async function toMediaUrl(
  media: StoredMedia | null | undefined,
): Promise<PublicMedia> {
  if (!media) return null;

  return {
    url: await createDownloadUrl(media.key),
    kind: media.mimeType.startsWith("audio/")
      ? "voice"
      : media.mimeType.startsWith("video/")
        ? "video"
        : "image",
    mimeType: media.mimeType,
    size: media.size,
    ...(media.originalName && { originalName: media.originalName }),
    ...(media.durationSec != null && { durationSec: media.durationSec }),
    ...(media.waveform && { waveform: media.waveform }),
  };
}

export async function toPublicMessage(
  m: MessageDoc,
  auth: AuthUser,
  precomputedMedia?: PublicMedia,
) {
  const base = {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    replyToId: m.replyToId ? String(m.replyToId) : null,
    type: m.type,
    createdAt: m.createdAt,
  };

  if (m.deletedAt && !can(auth, "message:view-deleted")) {
    return {
      ...base,
      text: null,
      media: null,
      reactions: [],
      editedAt: null,
      deletedAt: m.deletedAt,
    };
  }

  const media =
    precomputedMedia !== undefined
      ? precomputedMedia
      : await toMediaUrl(m.media);

  return {
    ...base,
    text: m.text ? decryptText(m.text) : null,
    media,
    reactions: m.reactions.map((reaction) => ({
      userId: String(reaction.userId),
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
    })),
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    ...(can(auth, "message:view-edit-history") && {
      editHistory: m.editHistory.map((entry) => ({
        text: decryptText(entry.text),
        editedAt: entry.editedAt,
      })),
    }),
  };
}
