import { z } from "zod";
import { messageIdParamsSchema } from "../../messages/schemas/message.schemas.ts";

export const conversationIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/, "Invalid conversation id."),
});

export const readConversationSchema = z.object({
  conversationId: conversationIdParamsSchema.shape.id,
  messageId: messageIdParamsSchema.shape.id,
});

export const typingSchema = z.object({
  conversationId: conversationIdParamsSchema.shape.id,
  isTyping: z.boolean(),
});

export const conversationRefSchema = z.object({
  conversationId: conversationIdParamsSchema.shape.id,
});

export type ConversationRefInput = z.infer<typeof conversationRefSchema>;
