export type StorageValidator<T> = (value: unknown) => value is T;

export interface SafeStorage {
  loadKey<T>(key: string, fallback: T, validate?: StorageValidator<T>): T;
  saveKey<T>(key: string, value: T): boolean;
  clearAll(): boolean;
}

/** Handles expected browser storage failures without blocking the application. */
export function createSafeStorage(getStorage: () => Storage, namespace: string): SafeStorage {
  const prefix = `${namespace}:`;
  return {
    loadKey<T>(key: string, fallback: T, validate?: StorageValidator<T>): T {
      try {
        const raw = getStorage().getItem(`${prefix}${key}`);
        if (raw === null) return fallback;
        const value: unknown = JSON.parse(raw);
        if (validate && !validate(value)) return fallback;
        return value as T;
      } catch {
        return fallback;
      }
    },
    saveKey<T>(key: string, value: T): boolean {
      try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) return false;
        getStorage().setItem(`${prefix}${key}`, serialized);
        return true;
      } catch {
        return false;
      }
    },
    clearAll(): boolean {
      try {
        const storage = getStorage();
        for (let index = storage.length - 1; index >= 0; index -= 1) {
          const key = storage.key(index);
          if (key?.startsWith(prefix)) storage.removeItem(key);
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}
