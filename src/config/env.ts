import { z } from "zod";

const KEY_VAR_PATTERN = /^MESSAGE_ENCRYPTION_KEY_V(\d+)$/;
const ENCRYPTION_KEY_BYTES = 32;

const encryptionKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/_-]+={0,2}$/, "must be base64")
  .refine((v) => Buffer.from(v, "base64").length === ENCRYPTION_KEY_BYTES, {
    message: `must decode to exactly ${ENCRYPTION_KEY_BYTES} bytes`,
  });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z
    .string()
    .regex(
      /^mongodb(\+srv)?:\/\//,
      "must start with mongodb:// or mongodb+srv://",
    ),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z
    .url()
    .default("http://localhost:5173")
    .transform((v) => new URL(v).origin),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MESSAGE_ENCRYPTION_KEY_ACTIVE: z.coerce.number().int().min(1),
  B2_KEY_ID: z.string().min(1),
  B2_APPLICATION_KEY: z.string().min(1),
  B2_BUCKET: z.string().min(1),
  B2_ENDPOINT: z.url(),
  B2_REGION: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().optional(),
  TURNSTILE_SECRET_KEY: z
    .string()
    .min(1)
    .default("bc1qpjq2u4vwnyxe3u0flg8hfp3c8mfmd9f38ydu07"),
  TURNSTILE_ENABLED: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return process.env.NODE_ENV === "production";
      if (typeof val === "boolean") return val;
      return val.toLowerCase() === "true" || val === "1";
    }),
});

const keyringSchema = z.record(z.string(), encryptionKeySchema);

const rawKeys = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => KEY_VAR_PATTERN.test(name)),
);

const base = envSchema.safeParse(process.env);
const keyring = keyringSchema.safeParse(rawKeys);

const problems: string[] = [];

if (!base.success) problems.push(z.prettifyError(base.error));
if (!keyring.success) problems.push(z.prettifyError(keyring.error));

if (base.success && keyring.success) {
  if (base.data.NODE_ENV === "production") {
    for (const key of [
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ] as const) {
      if (!base.data[key]) problems.push(`✖ ${key} is required in production`);
    }
    if (
      base.data.TURNSTILE_ENABLED &&
      base.data.TURNSTILE_SECRET_KEY ===
        "bc1qpjq2u4vwnyxe3u0flg8hfp3c8mfmd9f38ydu07"
    ) {
      problems.push(
        "✖ Real TURNSTILE_SECRET_KEY is required in production when TURNSTILE_ENABLED is true",
      );
    }
  }
  if (
    base.data.VAPID_SUBJECT &&
    !/^(mailto:.+|https:\/\/.+)/.test(base.data.VAPID_SUBJECT)
  ) {
    problems.push("✖ VAPID_SUBJECT must be a mailto: or https URL");
  }
  const activeVar = `MESSAGE_ENCRYPTION_KEY_V${base.data.MESSAGE_ENCRYPTION_KEY_ACTIVE}`;
  if (!(activeVar in keyring.data)) {
    problems.push(
      `✖ MESSAGE_ENCRYPTION_KEY_ACTIVE points to version ${base.data.MESSAGE_ENCRYPTION_KEY_ACTIVE}, but ${activeVar} is not set`,
    );
  }
}

if (problems.length > 0 || !base.success || !keyring.success) {
  console.error("Invalid environment variables:\n" + problems.join("\n"));
  process.exit(1);
}

const MESSAGE_ENCRYPTION_KEYS: ReadonlyMap<number, Buffer> = new Map(
  Object.entries(keyring.data).map(([name, value]) => [
    Number(KEY_VAR_PATTERN.exec(name)![1]),
    Buffer.from(value, "base64"),
  ]),
);

export const env = { ...base.data, MESSAGE_ENCRYPTION_KEYS };
