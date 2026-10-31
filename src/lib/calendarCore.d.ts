export interface CalendarSuggestion { key: string; title: string; month: number; day: number; traditions: string[] }
export interface CalendarDated { title: string; date: string; yearly: boolean }
export type CalendarKind = "celebracao" | "obrigacao" | "gira" | "outro";
export declare const KINDS: { id: CalendarKind; label: string; defaultPublic: boolean }[];
export function kindLabel(id: string): string;
export function kindDefaultPublic(id: string): boolean;
export declare const MONTHS: string[];
export declare const TRADITIONS: string[];
export declare const SUGGESTIONS: CalendarSuggestion[];
export function suggestionsFor(tradition: string, taken?: string[], limit?: number): CalendarSuggestion[];
export function parseDate(text: string): { y: number; m: number; d: number } | null;
export function nextOccurrence(item: { date: string; yearly: boolean }, today: string): string | null;
export function daysUntil(dateText: string, today: string): number | null;
export function formatDay(dateText: string, withYear?: boolean): string;
export function whenLabel(days: number | null): string;
export function upcoming<T extends CalendarDated>(items: T[], today: string): (T & { next: string | null })[];
export function todayLocal(now?: Date): string;
