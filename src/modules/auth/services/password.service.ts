import { hash, verify } from "argon2";

export function hashPassword(password: string) {
  return hash(password);
}

export async function verifyPassword(password: string, storedHash: string) {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
