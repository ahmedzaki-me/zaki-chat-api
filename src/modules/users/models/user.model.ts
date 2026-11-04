import { Schema, model, type InferSchemaType } from "mongoose";

export const USER_ROLES = ["owner", "user"] as const;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 20 },
    role: { type: String, enum: USER_ROLES, default: "user", required: true },
    username: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    lastSeenAt: { type: Date, default: null },
    avatarKey: { type: String, default: null },
  },
  { timestamps: true },
);

userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: "owner" } },
);
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string" } } },
);

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
