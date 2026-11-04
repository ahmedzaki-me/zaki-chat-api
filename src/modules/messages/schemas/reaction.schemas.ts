import { z } from "zod";
import { messageIdParamsSchema } from "./message.schemas.ts";

const segmenter = new Intl.Segmenter();

// emoji, flag (two regional indicators) or keycap
const EMOJI_START =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)/u;

export const emojiSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(
    (v) => [...segmenter.segment(v)].length === 1 && EMOJI_START.test(v),
    "Must be a single emoji.",
  );

export const addReactionSchema = z.object({ emoji: emojiSchema });

export const reactionParamsSchema = messageIdParamsSchema.extend({
  emoji: emojiSchema,
});
