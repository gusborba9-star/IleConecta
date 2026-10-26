import { createSafeStorage } from "@/lib/storageCore";
import type { StorageValidator } from "@/lib/storageCore";

const NS = "ile-conecta:v1";
const storage = createSafeStorage(() => globalThis.localStorage, NS);

export function loadKey<T>(key: string, fallback: T, validate?: StorageValidator<T>): T {
  return storage.loadKey(key, fallback, validate);
}

/** Returns false when local storage is unavailable, serialization fails, or quota is exceeded. */
export function saveKey<T>(key: string, value: T): boolean {
  return storage.saveKey(key, value);
}

/** Clears only keys owned by this demo namespace. */
export function clearAll(): boolean {
  return storage.clearAll();
}
