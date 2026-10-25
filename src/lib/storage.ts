const NS = "ile-conecta:v1";

export function loadKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveKey<T>(key: string, value: T) {
  try {
    localStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable or exceed quota; demo persistence is best-effort.
  }
}

export function clearAll() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(`${NS}:`))
    .forEach((k) => localStorage.removeItem(k));
}
