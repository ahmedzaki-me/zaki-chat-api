import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { b2Client } from "./b2.client.ts";
import { env } from "../../config/env.ts";
import type { AppError } from "../errors/app-error.ts";

export const UPLOAD_URL_TTL_SECONDS = 300;
export const DOWNLOAD_URL_TTL_SECONDS = 3600;

export async function createUploadUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
}) {
  const command = new PutObjectCommand({
    Bucket: env.B2_BUCKET,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  return getSignedUrl(b2Client, command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

export function createDownloadUrl(key: string) {
  return getSignedUrl(
    b2Client,
    new GetObjectCommand({ Bucket: env.B2_BUCKET, Key: key }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

export async function deleteObject(key: string) {
  await b2Client.send(
    new DeleteObjectCommand({ Bucket: env.B2_BUCKET, Key: key }),
  );
}

export async function headObject(key: string) {
  return b2Client.send(
    new HeadObjectCommand({ Bucket: env.B2_BUCKET, Key: key }),
  );
}

export async function readPrefix(key: string, length: number) {
  const object = await b2Client.send(
    new GetObjectCommand({
      Bucket: env.B2_BUCKET,
      Key: key,
      Range: `bytes=0-${length - 1}`,
    }),
  );
  return object.Body ? object.Body.transformToByteArray() : new Uint8Array();
}

export async function discardAndReject(
  key: string,
  error: AppError,
): Promise<never> {
  await deleteObject(key);
  throw error;
}
