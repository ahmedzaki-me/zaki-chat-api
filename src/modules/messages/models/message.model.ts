import { Schema, model, type InferSchemaType } from "mongoose";
import { encryptedTextSchema } from "../../../shared/db/encrypted-text.schema.ts";

export const MESSAGE_TYPES = ["text", "image", "video", "voice"] as const;

const editSchema = new Schema(
  {
    text: { type: encryptedTextSchema, required: true }, // text before this edit
    editedAt: { type: Date, default: Date.now }, // when it was replaced
  },
  { _id: false },
);

const mediaSchema = new Schema(
  {
    key: { type: String, required: true }, // storage path, never exposed to clients
    originalName: { type: String, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    width: { type: Number, min: 1 }, // image, video
    height: { type: Number, min: 1 }, // image, video
    durationSec: { type: Number, min: 0 }, // video, voice
    waveform: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (values: number[]) => values.every(Number.isInteger),
        message: "Waveform values must be integers.",
      },
    },
  },
  { _id: false },
);

const reactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true, trim: true, maxlength: 32 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: MESSAGE_TYPES, required: true },

    // text message: required. image/video: optional caption.
    // Stored encrypted. The 2000-char limit is enforced before encryption (request schema).
    text: { type: encryptedTextSchema },
    media: { type: mediaSchema },

    reactions: { type: [reactionSchema], default: [] },

    replyToId: { type: Schema.Types.ObjectId, ref: "Message" },

    // editing
    editedAt: { type: Date },
    editHistory: { type: [editSchema], default: [] }, // text before the last edit (owner only)

    // soft delete (only the owner can still see it)
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, _id: -1 });

// Shape rules per message type
messageSchema.pre("validate", function () {
  if (this.type === "text") {
    if (!this.text) {
      this.invalidate(
        "text",
        "Text is required for text messages.",
        undefined,
        "required",
      );
    }
    if (this.media) {
      this.invalidate(
        "media",
        "Text messages cannot have media.",
        undefined,
        "forbidden",
      );
    }
    return;
  }

  if (!this.media) {
    this.invalidate(
      "media",
      "Media is required for this message type.",
      undefined,
      "required",
    );
    return;
  }
  if (this.type === "voice") {
    if (!this.media.durationSec || this.media.durationSec <= 0) {
      this.invalidate("media.durationSec", "Voice duration must be greater than 0.", undefined, "range");
    }
    if (!this.media.waveform || this.media.waveform.length < 20 || this.media.waveform.length > 80 || !this.media.waveform.every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) {
      this.invalidate("media.waveform", "Voice waveform must contain 20 to 80 integer values from 0 to 100.", undefined, "range");
    }
  }

});

export type Message = InferSchemaType<typeof messageSchema>;
export const MessageModel = model("Message", messageSchema);
