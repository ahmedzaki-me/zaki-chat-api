import type { RequestHandler } from "express";
import { assertCan } from "../../../shared/permissions/policy.ts";
import { conversationIdParamsSchema } from "../schemas/conversation.schemas.ts";
import { pinChat, unpinChat } from "../services/conversation.actions.ts";
import {
  getAuthorizedConversation,
  getOrCreateOwnConversation,
  listConversations,
} from "../services/conversation.service.ts";
import { toPublicConversation } from "./conversation.http.ts";

export const getMine: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  assertCan(auth, "conversation:get-own");

  const rawLang = req.headers["x-lang"];
  const lang =
    typeof rawLang === "string" && rawLang.toLowerCase().startsWith("en")
      ? "en"
      : "ar";

  const conversation = await getOrCreateOwnConversation(auth.id, lang);
  res.json({ conversation: await toPublicConversation(conversation, auth) });
};

export const list: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  assertCan(auth, "conversation:list");

  const conversations = await listConversations();
  res.json({
    conversations: await Promise.all(
      conversations.map((c) => toPublicConversation(c, auth)),
    ),
  });
};

export const getById: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = conversationIdParamsSchema.parse(req.params);

  const conversation = await getAuthorizedConversation(auth, id, "conversation:read");
  res.json({ conversation: await toPublicConversation(conversation, auth) });
};

export const pin: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = conversationIdParamsSchema.parse(req.params);

  const conversation = await pinChat(auth, id);
  res.json({ conversation: await toPublicConversation(conversation, auth) });
};

export const unpin: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = conversationIdParamsSchema.parse(req.params);

  const conversation = await unpinChat(auth, id);
  res.json({ conversation: await toPublicConversation(conversation, auth) });
};
