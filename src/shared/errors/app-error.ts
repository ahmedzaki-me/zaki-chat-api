export type FieldError = { code: string; message: string };
export type FieldErrors = Record<string, FieldError[]>;

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors?: FieldErrors;
};

type AppErrorOptions = {
  status: number;
  code: string;
  title: string;
  detail: string;
  errors?: FieldErrors;
  cause?: unknown;
};

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly errors?: FieldErrors;

  constructor({ status, code, title, detail, errors, cause }: AppErrorOptions) {
    super(detail, { cause });
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.title = title;
    this.errors = errors;
  }

  get detail(): string {
    return this.message;
  }

  toProblem(instance: string): ProblemDetails {
    return {
      type: `/problems/${this.code.toLowerCase().replaceAll("_", "-")}`,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance,
      code: this.code,
      ...(this.errors && { errors: this.errors }),
    };
  }

  static badRequest(detail: string, code = "BAD_REQUEST") {
    return new AppError({ status: 400, code, title: "Bad Request", detail });
  }

  static unauthorized(detail: string, code = "UNAUTHORIZED") {
    return new AppError({ status: 401, code, title: "Unauthorized", detail });
  }

  static forbidden(detail: string, code = "FORBIDDEN") {
    return new AppError({ status: 403, code, title: "Forbidden", detail });
  }

  static notFound(detail: string, code = "NOT_FOUND") {
    return new AppError({ status: 404, code, title: "Not Found", detail });
  }

  static conflict(detail: string, errors?: FieldErrors, code = "CONFLICT") {
    return new AppError({
      status: 409,
      code,
      title: "Conflict",
      detail,
      errors,
    });
  }

  static validation(
    errors: FieldErrors,
    detail = "One or more fields are invalid.",
  ) {
    return new AppError({
      status: 422,
      code: "VALIDATION_FAILED",
      title: "Validation Failed",
      detail,
      errors,
    });
  }

  static tooManyRequests(
    detail = "Too many requests. Please try again later.",
    code = "RATE_LIMITED",
  ) {
    return new AppError({
      status: 429,
      code,
      title: "Too Many Requests",
      detail,
    });
  }
}
