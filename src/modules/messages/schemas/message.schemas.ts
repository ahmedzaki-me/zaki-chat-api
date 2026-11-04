import { z } from "zod";

export const MAX_TEXT_LENGTH = 2000;
const text = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
export const messageIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/, "Invalid message id."),
});
const replyToId = messageIdParamsSchema.shape.id.nullable().optional();
export const listMessagesQuerySchema = z.object({
  before: z.string().regex(/^[0-9a-f]{24}$/, "Invalid cursor.").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const imageOrVideoAttachmentSchema = z.object({
  key: z.string().min(1).max(512),
  kind: z.enum(["image", "video"]),
  originalName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});
const voiceAttachmentSchema = z.object({
  key: z.string().min(1).max(512),
  kind: z.literal("voice"),
  size: z.number().int().positive(),
  durationSec: z.number().positive(),
  waveform: z.array(z.number().int().min(0).max(100)).min(20).max(80),
});
export const attachmentSchema = z.discriminatedUnion("kind", [
  imageOrVideoAttachmentSchema,
  voiceAttachmentSchema,
]);

export const sendMessageSchema = z
  .object({
    text: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
    attachment: attachmentSchema.optional(),
    caption: z.string().trim().max(MAX_TEXT_LENGTH).nullable().optional(),
    replyToId,
  })
  .refine((value) => Boolean(value.attachment) !== Boolean(value.text?.trim()), {
    message: "Provide either text or an attachment.",
  })
  .refine(
    (value) =>
      value.attachment?.kind !== "voice" ||
      (!value.text?.trim() && !value.caption?.trim()),
    { message: "Voice messages cannot include text or a caption." },
  )
  .refine((value) => !value.caption || Boolean(value.attachment), {
    message: "Caption is only valid with an attachment.",
  });

export const sendTextMessageSchema = z.object({ text, replyToId });
export const editMessageSchema = z.object({ text });

export const socketSendMessageSchema = z
  .object({
    conversationId: z.string().regex(/^[0-9a-f]{24}$/, "Invalid conversation id."),
  })
  .and(sendMessageSchema);

export const socketEditMessageSchema = messageIdParamsSchema.extend({
  text: editMessageSchema.shape.text,
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SocketSendMessageInput = z.infer<typeof socketSendMessageSchema>;
export type SocketEditMessageInput = z.infer<typeof socketEditMessageSchema>;
