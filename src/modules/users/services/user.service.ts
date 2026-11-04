import { AppError } from "../../../shared/errors/app-error.ts";
import {
  confirmUpload,
} from "../../../shared/storage/storage.service.ts";
import { UserModel } from "../models/user.model.ts";
import type { SetAvatarInput } from "../schemas/user.schemas.ts";

export async function setAvatar(userId: string, { key }: SetAvatarInput) {
  await confirmUpload({ purpose: "avatar", ownerId: userId, key });

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { avatarKey: key } },
    { new: false },
  );
  if (!user) {
    throw AppError.unauthorized("User no longer exists.", "USER_NOT_FOUND");
  }

  return { user, oldKey: user.avatarKey };
}

export async function removeAvatar(userId: string) {
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { avatarKey: null } },
    { new: false },
  );
  if (!user) {
    throw AppError.unauthorized("User no longer exists.", "USER_NOT_FOUND");
  }

  return { user, oldKey: user.avatarKey };
}

