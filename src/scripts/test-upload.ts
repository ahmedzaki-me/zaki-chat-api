import { requestUpload } from "../shared/storage/storage.service.ts";
import { AppError } from "../shared/errors/app-error.ts";

async function attempt(label: string, contentType: string, size: number) {
  try {
    const { key } = await requestUpload({
      purpose: "avatar",
      ownerId: "test-user",
      contentType,
      size,
    });
    console.log(label, "-> OK", key);
  } catch (err) {
    console.log(
      label,
      "->",
      err instanceof AppError
        ? `${err.status} ${JSON.stringify(err.errors)}`
        : err,
    );
  }
}

await attempt("valid webp", "image/webp", 100_000);
await attempt("png", "image/png", 100_000);
await attempt("too big", "image/webp", 3 * 1024 * 1024);
await attempt("prototype key", "constructor", 100_000);
