import type { Types, UpdateQuery } from "mongoose";
import { realtimeBus } from "../../../realtime/bus.ts";
import { AppError } from "../../../shared/errors/app-error.ts";
import { assertCan, type Action } from "../../../shared/permissions/policy.ts";
import type { AuthUser } from "../../auth/services/token.service.ts";
import { sendStoredMessage } from "../../messages/services/message.service.ts";
import {
  ConversationModel,
  type Conversation,
} from "../models/conversation.model.ts";
import { UserModel, type User } from "../../users/models/user.model.ts";

type PopulatedUser = {
  _id: Types.ObjectId;
  name: string;
  username?: string;
  role: User["role"];
  lastSeenAt: Date | null;
  avatarKey?: string | null;
};

export type ConversationWithUser = Omit<Conversation, "userId"> & {
  _id: Types.ObjectId;
  userId: PopulatedUser;
};

let cachedOwnerProfile: { name: string; avatarKey?: string | null } | null =
  null;

export async function getOwnerProfile() {
  if (cachedOwnerProfile) return cachedOwnerProfile;
  const profile = await UserModel.findOne({ role: "owner" })
    .select("name avatarKey")
    .lean<{ name: string; avatarKey?: string | null }>();
  if (profile) cachedOwnerProfile = profile;
  return profile;
}

export function invalidateOwnerProfileCache() {
  cachedOwnerProfile = null;
}

export function isOwnerSelfConversation(conversation: {
  isSelf?: boolean;
  userId?: { role?: string };
}) {
  if (typeof conversation.isSelf === "boolean") return conversation.isSelf;
  return conversation.userId?.role === "owner";
}

const notFound = () =>
  AppError.notFound("Conversation not found.", "CONVERSATION_NOT_FOUND");

function buildWelcomeMessage(lang: string, isGuest: boolean): string {
  if (lang.toLowerCase().startsWith("en")) {
    const lines = [
      "Welcome! 👋",
      "",
      "• This conversation is completely secure. The owner (Ahmed Zaki) does not know your real identity, so feel free to speak your mind.",
      "• Please enable notifications to ensure you receive replies as soon as they are sent.",
      "• For a smoother experience, we recommend installing this site as an app on your phone (PWA / Add to Home screen).",
    ];
    if (isGuest) {
      lines.push(
        "• You are currently chatting as a guest. We recommend upgrading your account with a username and password to easily return to this conversation from any other device.",
      );
    }
    return lines.join("\n");
  }

  const lines = [
    "أهلاً بك! 👋",
    "",
    "• هذه المحادثة آمنة بالكامل ولا يعرف المالك (أحمد زكي) هويتك الحقيقية، فتحدث بكل أريحية وقل ما يحلو لك.",
    "• الرجاء تفعيل الإشعارات لتصلك كل الردود.",
    "• يفضل تحميل الموقع كتطبيق على الهاتف لتجربة استخدام أسلس.",
  ];
  if (isGuest) {
    lines.push(
      "• أنت تستخدم حالياً حساب زائر؛ يفضل ترقية حسابك باختيار اسم مستخدم وكلمة سر لضمان الرجوع للمحادثة من أي جهاز آخر باسم المستخدم وكلمة السر اللذان ستختارهما.",
    );
  }
  return lines.join("\n");
}

// One conversation per user, created on first access.
export async function getOrCreateOwnConversation(userId: string, lang = "ar") {
  let conversation = await ConversationModel.findOne({ userId })
    .populate("userId", "name username role lastSeenAt avatarKey")
    .lean<ConversationWithUser>();

  if (conversation) return conversation;

  const user = await UserModel.findById(userId).lean();
  if (!user) throw notFound();

  const isSelf = user.role === "owner";
  const created = await ConversationModel.create({ userId, isSelf });

  if (!isSelf) {
    const owner = await UserModel.findOne({ role: "owner" })
      .select("_id")
      .lean();
    if (owner) {
      const isGuest = !user.username;
      const text = buildWelcomeMessage(lang, isGuest);
      const welcomeMessage = await sendStoredMessage(
        String(owner._id),
        String(created._id),
        { text },
        "user",
      );
      realtimeBus.emit("message.created", welcomeMessage);
    }
  }

  conversation = await ConversationModel.findById(created._id)
    .populate("userId", "name username role lastSeenAt avatarKey")
    .lean<ConversationWithUser>();

  if (!conversation) throw notFound();
  return conversation;
}

// Pinned first (latest pin on top), then by latest activity.
export async function listConversations() {
  return ConversationModel.find()
    .sort({ pinnedAt: -1, lastMessageAt: -1, _id: -1 })
    .populate("userId", "name username role lastSeenAt avatarKey")
    .lean<ConversationWithUser[]>();
}

export async function getConversationById(id: string) {
  const conversation = await ConversationModel.findById(id)
    .populate("userId", "name username role lastSeenAt avatarKey")
    .lean<ConversationWithUser>();

  if (!conversation) throw notFound();
  return conversation;
}

/** Fetches a conversation and verifies authorization in a single step. */
export async function getAuthorizedConversation(
  auth: AuthUser,
  id: string,
  action: Action = "conversation:read",
) {
  const conversation = await getConversationById(id);
  assertCan(auth, action, {
    conversationUserId: String(conversation.userId._id),
  });
  return conversation;
}

async function updateConversation(
  id: string,
  update: UpdateQuery<Conversation>,
) {
  const conversation = await ConversationModel.findByIdAndUpdate(id, update, {
    returnDocument: "after",
  })
    .populate("userId", "name username role lastSeenAt avatarKey")
    .lean<ConversationWithUser>();

  if (!conversation) throw notFound();
  return conversation;
}

// Idempotent: pinning an already pinned chat keeps its original pin time.
export async function pinConversation(id: string) {
  const conversation = await getConversationById(id);
  if (conversation.pinnedAt) return conversation;
  return updateConversation(id, { $set: { pinnedAt: new Date() } });
}

export function unpinConversation(id: string) {
  return updateConversation(id, { $unset: { pinnedAt: 1 } });
}
