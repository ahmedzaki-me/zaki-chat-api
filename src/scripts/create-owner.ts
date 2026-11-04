import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import mongoose from "mongoose";
import type { ZodType } from "zod";
import { env } from "../config/env.ts";
import { signupSchema } from "../modules/auth/schemas/auth.schemas.ts";
import { hashPassword } from "../modules/auth/services/password.service.ts";
import { UserModel } from "../modules/users/models/user.model.ts";
import { isDuplicateKey } from "../shared/db/mongo-errors.ts";

/* ---------- terminal prompts (password input is hidden) ---------- */

let muted = false;

const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});

const rl = createInterface({ input: process.stdin, output, terminal: true });

rl.on("SIGINT", () => {
  console.log("\nCancelled.");
  process.exit(130);
});

async function askSecret(label: string) {
  process.stdout.write(label);
  muted = true;
  const answer = await rl.question("");
  muted = false;
  process.stdout.write("\n");
  return answer;
}

// Re-asks until the value passes the same rules used by /auth/signup.
async function ask<T>(label: string, schema: ZodType<T>, secret = false) {
  while (true) {
    const raw = secret ? await askSecret(label) : await rl.question(label);
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;

    for (const issue of parsed.error.issues) {
      console.log(`  ✖ ${issue.message}`);
    }
  }
}

async function askPassword() {
  while (true) {
    const password = await ask("Password: ", signupSchema.shape.password, true);
    const confirm = await askSecret("Confirm password: ");
    if (password === confirm) return password;
    console.log("  ✖ Passwords do not match.");
  }
}

/* ---------- main ---------- */

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  if (await UserModel.exists({ role: "owner" })) {
    console.error("An owner already exists. Nothing to do.");
    process.exitCode = 1;
    return;
  }

  console.log("Create the owner account\n");
  const name = await ask("Name: ", signupSchema.shape.name);
  const username = await ask("Username: ", signupSchema.shape.username);
  const password = await askPassword();

  const passwordHash = await hashPassword(password);

  try {
    await UserModel.create({ name, username, passwordHash, role: "owner" });
  } catch (err) {
    if (isDuplicateKey(err)) {
      console.error("\nThat username is taken, or an owner was just created.");
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log(`\nOwner "${username}" created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await mongoose.disconnect();
  });
