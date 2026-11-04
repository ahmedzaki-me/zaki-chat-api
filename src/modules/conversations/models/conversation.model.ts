import { Schema, model, type InferSchemaType } from "mongoose";
import { encryptedTextSchema } from "../../../shared/db/encrypted-text.schema.ts";
import { MESSAGE_TYPES } from "../../messages/models/message.model.ts";

// Mirror of the actual last message (encrypted text copied as is, not truncated)
const lastMessageSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    text: { type: encryptedTextSchema },
    durationSec: { type: Number, min: 0 }, // video, voice
    media: {
      key: { type: String, required: true },
      originalName: { type: String },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
      kind: { type: String, enum: ["image", "video", "voice"], required: true },
    },
    deletedAt: { type: Date }, // soft-deleted: only the owner may see the content
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    // exactly one conversation per user (the owner included)
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isSelf: { type: Boolean, default: false },
    lastMessageAt: { type: Date },
    lastMessage: { type: lastMessageSchema },
    // set when the owner pins the chat; pinned chats sort first (latest pin on top)
    pinnedAt: { type: Date },
    userDeliveredUpTo: { type: Schema.Types.ObjectId, default: null },
    userReadUpTo: { type: Schema.Types.ObjectId, default: null },
    ownerDeliveredUpTo: { type: Schema.Types.ObjectId, default: null },
    ownerReadUpTo: { type: Schema.Types.ObjectId, default: null },
    userUnreadCount: { type: Number, default: 0, min: 0 },
    ownerUnreadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1 }, { unique: true });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ pinnedAt: -1, lastMessageAt: -1, _id: -1 });

export type Conversation = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = model("Conversation", conversationSchema);
