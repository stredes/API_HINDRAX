import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_ROOT_KEY_SHA256 =
  "5b8460946a2343a4cc2ef15b058b4d7964c7163863eb809af3f8a1be1c9cfb6f";

export const ADMIN_CONFIRM_FIREBASE_RESET = "RESET_FIREBASE";

export function resolveRootKeyHash(value = process.env.ROOT_KEY_SHA256) {
  return value?.trim() || DEFAULT_ROOT_KEY_SHA256;
}

export function isValidRootKey(rootKey, expectedHash = resolveRootKeyHash()) {
  if (typeof rootKey !== "string" || rootKey.trim().length === 0) {
    return false;
  }
  const candidate = createHash("sha256").update(rootKey.trim()).digest("hex");
  const candidateBuffer = Buffer.from(candidate, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(candidateBuffer, expectedBuffer);
}
