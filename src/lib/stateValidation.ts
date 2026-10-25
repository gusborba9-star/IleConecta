export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "string");
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function optional(value: unknown, validate: (item: unknown) => boolean): boolean {
  return value === undefined || validate(value);
}

export function hasUniqueIds(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((item) => isRecord(item)
    && typeof item.id === "string" && item.id.length > 0)) return false;
  return new Set(value.map((item) => item.id)).size === value.length;
}
