import { z } from "zod";
import { normalizeMediaContentType, type UploadPurpose } from "../../../shared/storage/upload-policy.ts";

const purpose = z.enum(["avatar", "chat-media"] satisfies [
  UploadPurpose,
  ...UploadPurpose[],
]);
const originalName = z
  .string()
  .transform((name) => name.split(/[\\/]/).pop() ?? "")
  .pipe(z.string().trim().min(1).max(255));

export const presignUploadSchema = z
  .object({
    purpose,
    contentType: z.string().min(1).transform(normalizeMediaContentType),
    size: z.number().int().positive(),
    originalName: originalName.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.purpose === "chat-media" && !value.contentType.startsWith("audio/") && !value.originalName) {
      ctx.addIssue({
        code: "custom",
        path: ["originalName"],
        message: "Original name is required.",
      });
    }
  });

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;


