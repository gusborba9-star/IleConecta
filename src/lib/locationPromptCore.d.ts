export const COOLDOWN_DAYS: number;
export function missingLocation(u: { city?: string | null; state?: string | null } | null | undefined): boolean;
export function shouldShowLocationPrompt(a: { user: { city?: string | null; state?: string | null } | null | undefined; dismissedAt?: number | null; context?: "home" | "inline"; now?: number }): boolean;
export function cleanCity(s: unknown): string;
