const NS = "ile-conecta:v1";
type Validator<T> = (value: unknown) => value is T;

export function loadKey<T>(key: string, fallback: T, validate?: Validator<T>): T {
  const storageKey = `${NS}:${key}`;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    if (validate && !validate(value)) {
      recoverInvalidKey(storageKey, raw);
      return fallback;
    }
    return value as T;
  } catch {
    // JSON parsing and browser storage can fail (private mode, quota, permissions).
    if (raw !== null) recoverInvalidKey(storageKey, raw);
    return fallback;
  }
}

function recoverInvalidKey(key: string, raw: string): void {
  try {
    localStorage.setItem(`${key}:recovery`, raw);
  } catch {
    console.warn("Ilê Conecta: não foi possível guardar a cópia de recuperação.");
  }
  try {
    localStorage.removeItem(key);
  } catch {
    console.warn("Ilê Conecta: não foi possível remover o estado local inválido.");
  }
}

export function saveKey<T>(key: string, value: T): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
    localStorage.setItem(`${NS}:${key}`, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearAll(): boolean {
  try {
    Object.keys(localStorage).filter((key) => key.startsWith(`${NS}:`))
      .forEach((key) => localStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}
