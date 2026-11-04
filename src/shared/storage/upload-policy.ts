import { randomUUID } from "node:crypto";
const MB = 1024 * 1024;
type MediaKind = "image" | "video" | "voice";
type MediaFormat = { extension: string; signature: (bytes: Uint8Array) => boolean };
const starts = (bytes: Uint8Array, values: number[]) => values.every((value, index) => bytes[index] === value);
const ascii = (bytes: Uint8Array, start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
const jpeg = (b: Uint8Array) => starts(b, [0xff, 0xd8, 0xff]);
const png = (b: Uint8Array) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = (b: Uint8Array) => b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
const gif = (b: Uint8Array) => ["GIF87a", "GIF89a"].includes(ascii(b, 0, 6));
const mp4 = (b: Uint8Array) => b.length >= 8 && ascii(b, 4, 8) === "ftyp";
const webm = (b: Uint8Array) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]);
const quicktime = (b: Uint8Array) => mp4(b) && ascii(b, 8, 12) === "qt  ";
const ogg = (b: Uint8Array) => ascii(b, 0, 4) === "OggS";
export function normalizeMediaContentType(contentType: string) {
  return contentType.split(";", 1)[0]!.trim().toLowerCase();
}
export const MEDIA_REGISTRY = {
  image: { kind: "image", maxBytes: 2 * MB, types: { "image/jpeg": { extension: "jpg", signature: jpeg }, "image/png": { extension: "png", signature: png }, "image/webp": { extension: "webp", signature: webp } } },
  gif: { kind: "image", maxBytes: 10 * MB, types: { "image/gif": { extension: "gif", signature: gif } } },
  video: { kind: "video", maxBytes: 50 * MB, types: { "video/mp4": { extension: "mp4", signature: mp4 }, "video/webm": { extension: "webm", signature: webm }, "video/quicktime": { extension: "mov", signature: quicktime } } },
  voice: { kind: "voice", maxBytes: 5 * MB, types: { "audio/webm": { extension: "webm", signature: webm }, "audio/ogg": { extension: "ogg", signature: ogg }, "audio/mp4": { extension: "m4a", signature: mp4 } } },
} satisfies Record<string, { kind: MediaKind; maxBytes: number; types: Record<string, MediaFormat> }>;
export type MediaKindType = (typeof MEDIA_REGISTRY)[keyof typeof MEDIA_REGISTRY]["kind"];
export type MediaMimeType = keyof (typeof MEDIA_REGISTRY)[keyof typeof MEDIA_REGISTRY]["types"];
export type UploadPurpose = "avatar" | "chat-media";
export const AVATAR_MAX_BYTES = 2 * MB;
export function getMediaPolicy(contentType: string) {
  const normalized = normalizeMediaContentType(contentType);
  for (const group of Object.values(MEDIA_REGISTRY)) {
    const entry = Object.entries(group.types).find(([mime]) => mime === normalized);
    if (entry) return { kind: group.kind, maxBytes: group.maxBytes, ...entry[1], contentType: normalized };
  }
  return undefined;
}
export function mediaMimeTypes() { return Object.values(MEDIA_REGISTRY).flatMap((group) => Object.keys(group.types)); }
export function objectKeyPrefix(purpose: UploadPurpose, ownerId: string) { return `${purpose}/${ownerId}/`; }
export function buildObjectKey(purpose: UploadPurpose, ownerId: string, extension: string) { return `${objectKeyPrefix(purpose, ownerId)}${randomUUID()}.${extension}`; }

