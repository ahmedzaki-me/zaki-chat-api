import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.ts";

export const notFound: RequestHandler = (req, _res, next) => {
  next(
    AppError.notFound(
      `Route ${req.method} ${req.path} not found.`,
      "ROUTE_NOT_FOUND",
    ),
  );
};
