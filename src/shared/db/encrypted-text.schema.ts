import { Schema } from "mongoose";

export const encryptedTextSchema = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);
