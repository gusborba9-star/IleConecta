export function clockTime(iso: string, timeZone?: string): string;
export function dayKey(iso: string, timeZone?: string): string;
export function dayLabel(iso: string, now?: number, timeZone?: string): string;
export function decorateMessages<T extends { createdAt: string }>(msgs: T[], senderOf: (m: T) => string | null, timeZone?: string): { message: T; newDay: boolean; sameSenderAsPrev: boolean }[];
