import type { RequestHandler } from "express";
import { requestUpload } from "../../../shared/storage/storage.service.ts";
import { presignUploadSchema } from "../schemas/upload.schemas.ts";

export const presign: RequestHandler = async (req, res) => {
  const input = presignUploadSchema.parse(req.body);
  const { key, url } = await requestUpload({ ...input, ownerId: req.auth!.id });

  res.status(200).json({
    key,
    url,
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.size),
    },
  });
};
