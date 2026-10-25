export type StorageValidator<T> = (value: unknown) => value is T;

export interface SafeStorage {
  loadKey<T>(key: string, fallback: T, validate?: StorageValidator<T>): T;
  saveKey<T>(key: string, value: T): boolean;
  clearAll(): boolean;
}

export function createSafeStorage(
  storageProvider: () => Storage | null | undefined,
  namespace: string
): SafeStorage;
