import { createDownloadUrl } from "../../../shared/storage/storage.service.ts";

export function toAvatarUrl(avatarKey?: string | null) {
  return avatarKey ? createDownloadUrl(avatarKey) : Promise.resolve(null);
}
