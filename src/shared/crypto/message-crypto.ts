import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../config/env.ts";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface EncryptedText {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
}

function getKey(version: number): Buffer {
  const key = env.MESSAGE_ENCRYPTION_KEYS.get(version);
  if (!key) {
    throw new Error(`No encryption key configured for version ${version}`);
  }
  return key;
}

export function encryptText(plaintext: string): EncryptedText {
  const keyVersion = env.MESSAGE_ENCRYPTION_KEY_ACTIVE;
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, getKey(keyVersion), iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptText(payload: EncryptedText): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(payload.keyVersion),
    Buffer.from(payload.iv, "base64"),
    { authTagLength: AUTH_TAG_BYTES },
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Failed to decrypt message (corrupted data or wrong key)");
  }
}
