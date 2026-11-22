export const MAX_TOKENS: number;
export interface TokenInfo { p: string; h: string; iat: number; exp: number }
export function decodeToken(token: unknown): TokenInfo | null;
export function remember(store: Record<string, string> | null | undefined, token: string, nowMs?: number): Record<string, string>;
export function candidates(store: Record<string, string> | null | undefined, nowMs?: number, limit?: number): string[];
