import { z } from "zod";

export const setAvatarSchema = z.object({
  key: z.string().min(1).max(512),
});

export type SetAvatarInput = z.infer<typeof setAvatarSchema>;
