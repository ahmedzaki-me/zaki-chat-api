import type { RequestHandler } from "express";
import { deleteObject } from "../../../shared/storage/storage.service.ts";
import { toPublicUser } from "../../auth/controllers/auth.http.ts";
import { invalidateOwnerProfileCache } from "../../conversations/services/conversation.service.ts";
import { setAvatarSchema } from "../schemas/user.schemas.ts";
import { removeAvatar, setAvatar } from "../services/user.service.ts";

async function cleanupAvatar(
  oldKey: string | null | undefined,
  log: { warn: (obj: object, msg: string) => void },
) {
  if (!oldKey) return;
  try {
    await deleteObject(oldKey);
  } catch (err) {
    log.warn({ err, key: oldKey }, "Failed to delete previous avatar");
  }
}

export const putAvatar: RequestHandler = async (req, res) => {
  const input = setAvatarSchema.parse(req.body);
  const { user, oldKey } = await setAvatar(req.auth!.id, input);

  if (oldKey && oldKey !== input.key) {
    await cleanupAvatar(oldKey, req.log);
  }

  if (req.auth!.role === "owner") {
    invalidateOwnerProfileCache();
  }

  res.json({ user: await toPublicUser(user) });
};

export const deleteAvatar: RequestHandler = async (req, res) => {
  const { oldKey } = await removeAvatar(req.auth!.id);

  await cleanupAvatar(oldKey, req.log);

  if (req.auth!.role === "owner") {
    invalidateOwnerProfileCache();
  }

  res.status(204).end();
};
