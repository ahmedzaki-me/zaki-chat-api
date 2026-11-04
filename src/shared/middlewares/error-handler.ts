import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { AppError, type FieldErrors } from "../errors/app-error.ts";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function fromZod(err: ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of err.issues) {
    const field = issue.path.map(String).join(".") || "_";
    (errors[field] ??= []).push({
      code: issue.code.toUpperCase(),
      message: issue.message,
    });
  }
  return errors;
}

function fromMongooseValidation(
  err: mongoose.Error.ValidationError,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const [field, e] of Object.entries(err.errors)) {
    (errors[field] ??= []).push({
      code: String(e.kind).toUpperCase(),
      message: e.message,
    });
  }
  return errors;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) return AppError.validation(fromZod(err));

  if (err instanceof mongoose.Error.ValidationError) {
    return AppError.validation(fromMongooseValidation(err));
  }

  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(
      `Invalid value for '${err.path}'.`,
      "INVALID_VALUE",
    );
  }

  if (isRecord(err)) {
    // Mongo duplicate key
    if (err.code === 11000 && isRecord(err.keyPattern)) {
      const errors: FieldErrors = {};
      for (const field of Object.keys(err.keyPattern)) {
        errors[field] = [
          { code: "DUPLICATE_VALUE", message: `'${field}' is already in use.` },
        ];
      }
      return AppError.conflict(
        "One or more fields conflict with existing data.",
        errors,
      );
    }

    // express.json() errors
    if (err.type === "entity.parse.failed") {
      return AppError.badRequest(
        "Request body contains invalid JSON.",
        "INVALID_JSON",
      );
    }
    if (err.type === "entity.too.large") {
      return new AppError({
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        title: "Payload Too Large",
        detail: "Request body is too large.",
      });
    }
  }

  return new AppError({
    status: 500,
    code: "INTERNAL_ERROR",
    title: "Internal Server Error",
    detail: "An unexpected error occurred.",
    cause: err,
  });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const appError = toAppError(err);
  if (appError.status >= 500) req.log.error({ err }, "Unhandled error");

  const instance = req.originalUrl.split("?", 1)[0] ?? "";

  res
    .status(appError.status)
    .type("application/problem+json")
    .json(appError.toProblem(instance));
};
