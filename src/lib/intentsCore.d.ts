export interface Intent { id: string; label: string; terms: string[] }
export const INTENTS: Intent[];
export function intentOf(q: string): Intent | null;
export function matchesIntent(intent: Intent | null, fields: (string | null | undefined)[]): boolean;
