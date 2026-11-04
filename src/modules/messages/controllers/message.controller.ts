import type { RequestHandler } from "express";
import { assertCan } from "../../../shared/permissions/policy.ts";
import { conversationIdParamsSchema } from "../../conversations/schemas/conversation.schemas.ts";
import {
  editMessageSchema,
  listMessagesQuerySchema,
  messageIdParamsSchema,
  sendMessageSchema,
} from "../schemas/message.schemas.ts";
import {
  clearConversation,
  deleteMessage,
  deleteMessagePermanently,
  editMessage,
  sendMessage,
} from "../services/message.actions.ts";
import {
  getConversationUserId,
  listMessages,
} from "../services/message.service.ts";
import { toPublicMessage } from "./message.http.ts";

export const list: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = conversationIdParamsSchema.parse(req.params);
  const query = listMessagesQuerySchema.parse(req.query);

  const conversationUserId = await getConversationUserId(id);
  assertCan(auth, "message:list", { conversationUserId });

  const { messages, nextCursor } = await listMessages(id, query);
  res.json({
    messages: await Promise.all(messages.map((m) => toPublicMessage(m, auth))),
    nextCursor,
  });
};

export const send: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = conversationIdParamsSchema.parse(req.params);
  const input = sendMessageSchema.parse(req.body);
  const message = await sendMessage(auth, id, input);
  res.status(201).json({ message: await toPublicMessage(message, auth) });
};

export const edit: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = messageIdParamsSchema.parse(req.params);
  const { text } = editMessageSchema.parse(req.body);

  const message = await editMessage(auth, id, text);
  res.json({ message: await toPublicMessage(message, auth) });
};

export const softDelete: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = messageIdParamsSchema.parse(req.params);

  const message = await deleteMessage(auth, id);
  res.json({ message: await toPublicMessage(message, auth) });
};

export const hardDelete: RequestHandler = async (req, res) => {
  const { id } = messageIdParamsSchema.parse(req.params);

  await deleteMessagePermanently(req.auth!, id);
  res.status(204).end();
};

export const clear: RequestHandler = async (req, res) => {
  const { id } = conversationIdParamsSchema.parse(req.params);

  await clearConversation(req.auth!, id);
  res.status(204).end();
};
