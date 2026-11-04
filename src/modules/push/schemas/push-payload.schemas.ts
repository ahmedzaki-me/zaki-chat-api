import { z } from "zod";

export const previewSchema = z.object({
  kind: z.enum(["text", "image", "gif", "video", "voice"]),
  text: z.string(),
  durationSec: z.number().optional(),
});

const senderSchema = z.object({ id: z.string(), name: z.string() });

export const pushPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(1),
    type: z.literal("message"),
    conversationId: z.string(),
    messageId: z.string(),
    sender: senderSchema,
    preview: previewSchema,
    createdAt: z.string().datetime(),
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("reaction"),
    conversationId: z.string(),
    messageId: z.string(),
    sender: senderSchema,
    emoji: z.string(),
    reactedToPreview: previewSchema,
    createdAt: z.string().datetime(),
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("new-user"),
    conversationId: z.string().optional(),
    sender: senderSchema,
    createdAt: z.string().datetime(),
  }),
]);

export type PushPayload = z.infer<typeof pushPayloadSchema>;
export type PushPreview = z.infer<typeof previewSchema>;
