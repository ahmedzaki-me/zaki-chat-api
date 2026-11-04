import { isDuplicateKey } from "../../../shared/db/mongo-errors.ts";
import { AppError } from "../../../shared/errors/app-error.ts";
import { UserModel } from "../../users/models/user.model.ts";
import type {
  GuestInput,
  LoginInput,
  SignupInput,
  UpgradeInput,
} from "../schemas/auth.schemas.ts";
import { hashPassword, verifyPassword } from "./password.service.ts";
import { openSession, type SessionMeta } from "./session.service.ts";
import { notifyUserJoined } from "../../push/services/notifier.service.ts";

function throwUsernameTaken(err: unknown): never {
  if (isDuplicateKey(err)) {
    throw AppError.conflict(
      "Username is already taken.",
      {
        username: [
          { code: "USERNAME_TAKEN", message: "Username is already taken." },
        ],
      },
      "USERNAME_TAKEN",
    );
  }
  throw err;
}

export async function registerGuest({ name }: GuestInput, meta: SessionMeta) {
  const user = await UserModel.create({ name });
  void notifyUserJoined(String(user._id));
  return { user, ...(await openSession(user, meta)) };
}

export async function registerUser(
  { name, username, password }: SignupInput,
  meta: SessionMeta,
) {
  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({ name, username, passwordHash }).catch(
    throwUsernameTaken,
  );
  void notifyUserJoined(String(user._id));
  return { user, ...(await openSession(user, meta)) };
}

export async function upgradeGuest(
  userId: string,
  { username, password }: UpgradeInput,
) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw AppError.unauthorized("User no longer exists.", "USER_NOT_FOUND");
  }
  if (user.username) {
    throw AppError.conflict(
      "Account is already upgraded.",
      undefined,
      "ALREADY_UPGRADED",
    );
  }

  user.username = username;
  user.passwordHash = await hashPassword(password);
  await user.save().catch(throwUsernameTaken);
  return user;
}

export async function loginUser(
  { username, password }: LoginInput,
  meta: SessionMeta,
) {
  const user = await UserModel.findOne({ username }).select("+passwordHash");
  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!user || !valid) {
    throw AppError.unauthorized(
      "Invalid username or password.",
      "INVALID_CREDENTIALS",
    );
  }

  return { user, ...(await openSession(user, meta)) };
}

export async function getCurrentUser(id: string) {
  const user = await UserModel.findById(id);
  if (!user) {
    throw AppError.unauthorized("User no longer exists.", "USER_NOT_FOUND");
  }
  return user;
}
