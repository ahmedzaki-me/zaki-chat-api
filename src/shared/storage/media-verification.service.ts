import { AppError } from "../errors/app-error.ts";
import {
  createUploadUrl,
  discardAndReject,
  headObject,
  readPrefix,
} from "./b2-storage.service.ts";
import {
  AVATAR_MAX_BYTES,
  buildObjectKey,
  getMediaPolicy,
  mediaMimeTypes,
  normalizeMediaContentType,
  objectKeyPrefix,
  type MediaKindType,
  type UploadPurpose,
} from "./upload-policy.ts";

const WEBP_HEADER_BYTES = 12;

function looksLikeWebp(bytes: Uint8Array) {
  return (
    bytes.length >= WEBP_HEADER_BYTES &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  );
}

export async function requestUpload(params: {
  purpose: UploadPurpose;
  ownerId: string;
  contentType: string;
  size: number;
  originalName?: string;
}) {
  const contentType =
    params.purpose === "chat-media"
      ? normalizeMediaContentType(params.contentType)
      : params.contentType;
  let extension: string;
  if (params.purpose === "avatar") {
    if (params.contentType !== "image/webp") {
      throw AppError.validation({
        contentType: [
          {
            code: "UNSUPPORTED_FILE_TYPE",
            message: "Allowed type: image/webp.",
          },
        ],
      });
    }
    if (params.size > AVATAR_MAX_BYTES) {
      throw AppError.validation({
        size: [
          {
            code: "FILE_TOO_LARGE",
            message: `Maximum size is ${AVATAR_MAX_BYTES} bytes.`,
          },
        ],
      });
    }
    extension = "webp";
  } else {
    const policy = getMediaPolicy(contentType);
    if (!policy) {
      throw AppError.validation({
        contentType: [
          {
            code: "UNSUPPORTED_FILE_TYPE",
            message: `Allowed types: ${mediaMimeTypes().join(", ")}.`,
          },
        ],
      });
    }
    if (params.size > policy.maxBytes) {
      throw AppError.validation({
        size: [
          {
            code: "FILE_TOO_LARGE",
            message: `Maximum size is ${policy.maxBytes} bytes.`,
          },
        ],
      });
    }
    extension = policy.extension;
    if (policy.kind !== "voice" && !params.originalName?.trim()) {
      throw AppError.validation({
        originalName: [
          {
            code: "INVALID_ORIGINAL_NAME",
            message: "Original name is required.",
          },
        ],
      });
    }
  }
  const key = buildObjectKey(params.purpose, params.ownerId, extension);
  const url = await createUploadUrl({
    key,
    contentType,
    contentLength: params.size,
  });
  return { key, url };
}

async function verifyMedia(key: string, ownerId: string) {
  if (!key.startsWith(objectKeyPrefix("chat-media", ownerId))) {
    throw AppError.forbidden(
      "This upload does not belong to you.",
      "UPLOAD_NOT_OWNED",
    );
  }
  let head;
  try {
    head = await headObject(key);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFound") {
      throw AppError.notFound(
        "Uploaded file was not found.",
        "UPLOAD_NOT_FOUND",
      );
    }
    throw err;
  }
  const policy = head.ContentType
    ? getMediaPolicy(head.ContentType)
    : undefined;
  const size = head.ContentLength ?? 0;
  if (!policy || size < 1 || size > policy.maxBytes) {
    return discardAndReject(
      key,
      AppError.validation({
        file: [
          {
            code: "INVALID_UPLOAD",
            message: "File type or size is not allowed.",
          },
        ],
      }),
    );
  }
  const signatureBytes = await readPrefix(key, 16);
  if (!policy.signature(signatureBytes)) {
    return discardAndReject(
      key,
      AppError.validation({
        file: [
          {
            code: "INVALID_FILE_SIGNATURE",
            message: "File content does not match its declared type.",
          },
        ],
      }),
    );
  }
  return { key, size, contentType: policy.contentType, kind: policy.kind };
}

export async function confirmUpload(params: {
  purpose: UploadPurpose;
  ownerId: string;
  key: string;
}) {
  if (params.purpose === "chat-media") {
    return verifyMedia(params.key, params.ownerId);
  }
  if (!params.key.startsWith(objectKeyPrefix("avatar", params.ownerId))) {
    throw AppError.forbidden(
      "This upload does not belong to you.",
      "UPLOAD_NOT_OWNED",
    );
  }
  let head;
  try {
    head = await headObject(params.key);
  } catch (err) {
    if (err instanceof Error && err.name === "NotFound") {
      throw AppError.notFound(
        "Uploaded file was not found.",
        "UPLOAD_NOT_FOUND",
      );
    }
    throw err;
  }
  if (
    head.ContentType !== "image/webp" ||
    (head.ContentLength ?? 0) > AVATAR_MAX_BYTES ||
    (head.ContentLength ?? 0) < 1
  ) {
    return discardAndReject(
      params.key,
      AppError.validation({
        file: [
          {
            code: "INVALID_UPLOAD",
            message: "File type or size is not allowed.",
          },
        ],
      }),
    );
  }
  if (!looksLikeWebp(await readPrefix(params.key, WEBP_HEADER_BYTES))) {
    return discardAndReject(
      params.key,
      AppError.validation({
        file: [
          { code: "INVALID_IMAGE", message: "File is not a valid WebP image." },
        ],
      }),
    );
  }
  return {
    key: params.key,
    size: head.ContentLength!,
    contentType: head.ContentType,
    kind: "image" as MediaKindType,
  };
}

export function verifyChatMedia(key: string, ownerId: string) {
  return verifyMedia(key, ownerId);
}
