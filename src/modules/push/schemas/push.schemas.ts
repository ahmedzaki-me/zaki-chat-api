import { z } from "zod";

export const upsertSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(256) }),
});
export const deleteSubscriptionSchema = z.object({ endpoint: z.url().max(2048) });
export type UpsertSubscriptionInput = z.infer<typeof upsertSubscriptionSchema>;
