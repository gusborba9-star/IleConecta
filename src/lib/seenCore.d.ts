export const SEEN_TTL_MS: number;
export const SEEN_MAX: number;
export function readSeen(raw: unknown, now?: number): Record<string, number>;
export function addSeen(map: Record<string, number>, ids: string[], now?: number): Record<string, number>;
