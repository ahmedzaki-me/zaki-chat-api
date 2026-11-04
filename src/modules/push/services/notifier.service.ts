import webPush from "web-push";
import { env } from "../../../config/env.ts";
import { isUserViewingConversation, isUserVisible } from "../../../realtime/connection-registry.ts";
import { SessionModel } from "../../auth/models/session.model.ts";
import { ConversationModel } from "../../conversations/models/conversation.model.ts";
import type { MessageDoc } from "../../messages/services/message.service.ts";
import { decryptText } from "../../../shared/crypto/message-crypto.ts";
import { logger } from "../../../shared/logger.ts";
import { UserModel } from "../../users/models/user.model.ts";
import { PushSubscriptionModel } from "../models/push-subscription.model.ts";
import type { PushPayload, PushPreview } from "../schemas/push-payload.schemas.ts";

const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
if (enabled) webPush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
else if (env.NODE_ENV === "development") logger.warn("Web Push is disabled: VAPID keys are not configured");

async function deliver(userId: string, payload: PushPayload, urgency: "high" | "normal") {
  if (!enabled) return;
  try {
    let subscriptions = await PushSubscriptionModel.find({ userId }).lean();
    const sessionIds = [...new Set(subscriptions.map((item) => String(item.sessionId)))];
    const sessions = await SessionModel.find({ _id: { $in: sessionIds } }).select("_id revokedAt expiresAt").lean();
    const active = new Set(sessions.filter((s) => !s.revokedAt && s.expiresAt > new Date()).map((s) => String(s._id)));
    const stale = subscriptions.filter((item) => !active.has(String(item.sessionId)));
    if (stale.length) await PushSubscriptionModel.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
    subscriptions = subscriptions.filter((item) => active.has(String(item.sessionId)));
    for (let offset = 0; offset < subscriptions.length; offset += 5) {
      const chunk = subscriptions.slice(offset, offset + 5);
      await Promise.allSettled(chunk.map(async (item) => {
        try {
          await webPush.sendNotification({ endpoint: item.endpoint, keys: item.keys! }, JSON.stringify(payload), { TTL: 86400, urgency });
          await PushSubscriptionModel.updateOne({ _id: item._id }, { $set: { lastUsedAt: new Date() } });
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await PushSubscriptionModel.deleteOne({ _id: item._id });
          else logger.warn({ err, subscriptionId: String(item._id) }, "Web Push delivery failed");
        }
      }));
    }
  } catch (err) { logger.warn({ err, userId }, "Web Push notification failed"); }
}

function preview(message: MessageDoc): PushPreview {
  if (message.type === "text") return { kind: "text", text: message.text ? decryptText(message.text).slice(0, 100) : "" };
  const kind = message.type === "image" && message.media?.mimeType === "image/gif" ? "gif" : message.type;
  const text = kind === "gif" ? "GIF" : kind === "image" ? "Photo" : kind === "video" ? "Video" : `Voice message ${formatDuration(message.media?.durationSec ?? 0)}`;
  return { kind, text, ...(message.type === "voice" && message.media?.durationSec != null ? { durationSec: message.media.durationSec } : {}) };
}
function formatDuration(value: number) { const n = Math.max(0, Math.round(value)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; }

let cachedOwnerId: string | null = null;
async function getOwnerId(): Promise<string | null> {
  if (cachedOwnerId) return cachedOwnerId;
  const owner = await UserModel.findOne({ role: "owner" }).select("_id").lean();
  if (owner) cachedOwnerId = String(owner._id);
  return cachedOwnerId;
}

async function displayName(userId: string) {
  const user = await UserModel.findById(userId).select("name username").lean();
  return user?.username || user?.name || "";
}
async function messageRecipient(message: MessageDoc) {
  const conversation = await ConversationModel.findById(message.conversationId).select("userId").lean();
  if (!conversation) return null;
  const userId = String(conversation.userId);
  const ownerId = await getOwnerId();
  if (!ownerId || ownerId === userId) return null;
  return String(message.senderId) === ownerId ? userId : ownerId;
}

export async function notifyMessageCreated(message: MessageDoc) {
  try {
    const recipientId = await messageRecipient(message);
    if (!recipientId) return;
    const conversationId = String(message.conversationId);
    if (isUserViewingConversation(recipientId, conversationId)) return;
    await deliver(recipientId, { v: 1, type: "message", conversationId, messageId: String(message._id), sender: { id: String(message.senderId), name: await displayName(String(message.senderId)) }, preview: preview(message), createdAt: message.createdAt.toISOString() }, "high");
  } catch (err) { logger.warn({ err }, "Could not prepare message push"); }
}

export async function notifyReactionAdded(message: MessageDoc, actorId: string, emoji: string) {
  try {
    const recipientId = String(message.senderId);
    if (recipientId === actorId) return;
    const conversationId = String(message.conversationId);
    if (isUserViewingConversation(recipientId, conversationId)) return;
    await deliver(recipientId, { v: 1, type: "reaction", conversationId, messageId: String(message._id), sender: { id: actorId, name: await displayName(actorId) }, emoji, reactedToPreview: preview(message), createdAt: new Date().toISOString() }, "high");
  } catch (err) { logger.warn({ err }, "Could not prepare reaction push"); }
}

export async function notifyUserJoined(userId: string) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId || isUserVisible(ownerId)) return;
    await deliver(ownerId, { v: 1, type: "new-user", sender: { id: userId, name: await displayName(userId) }, createdAt: new Date().toISOString() }, "normal");
  } catch (err) { logger.warn({ err }, "Could not prepare new-user push"); }
}
