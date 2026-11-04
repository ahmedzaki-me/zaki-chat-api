import { z } from "zod";

export const guestSchema = z.object({
  name: z.string().trim().min(1).max(20),
});

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(20)
  .regex(/^[a-z0-9_]+$/, "Only letters, numbers and underscores are allowed.");

const password = z.string().min(6).max(128);

export const signupSchema = guestSchema.extend({ username: usernameSchema, password });
export const upgradeSchema = z.object({ username: usernameSchema, password });
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(6).max(128),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/, "Invalid session id."),
});

export type GuestInput = z.infer<typeof guestSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type UpgradeInput = z.infer<typeof upgradeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
