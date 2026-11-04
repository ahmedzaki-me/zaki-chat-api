import type { RequestHandler } from "express";
import { messageIdParamsSchema } from "../schemas/message.schemas.ts";
import {
  addReactionSchema,
  reactionParamsSchema,
} from "../schemas/reaction.schemas.ts";
import {
  addMessageReaction,
  removeMessageReaction,
} from "../services/reaction.service.ts";
import { toPublicMessage } from "./message.http.ts";

export const add: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id } = messageIdParamsSchema.parse(req.params);
  const { emoji } = addReactionSchema.parse(req.body);

  const message = await addMessageReaction(auth, id, emoji);
  res.json({ message: await toPublicMessage(message, auth) });
};

export const remove: RequestHandler = async (req, res) => {
  const auth = req.auth!;
  const { id, emoji } = reactionParamsSchema.parse(req.params);

  const message = await removeMessageReaction(auth, id, emoji);
  res.json({ message: await toPublicMessage(message, auth) });
};
