export declare const TZ: string;
export declare const WEEKDAYS: { id: number; label: string }[];
export declare function validateWindow(start: string, end: string): string | null;
export declare function partsInBrasilia(iso: string): { day: string; time: string };
export declare function formatSlot(iso: string): string;
export declare function groupSlots(isoList: string[]): { day: string; label: string; slots: { iso: string; time: string }[] }[];
export declare function brasiliaToIso(day: string, time: string): string;
export interface BusyItem { startsAt: string; endsAt: string; label: string }
export declare function calendarOccurrences(items: { title: string; onDate: string; onTime: string | null; yearly: boolean }[], fromDay: string, days?: number): BusyItem[];
export declare function conflictsForWindow(weekday: number, start: string, end: string, busy: BusyItem[], now?: Date): { startsAt: string; when: string; label: string }[];
export declare function overlapsExistingWindow(weekday: number, start: string, end: string, windows: { weekday: number; start: string; end: string }[]): boolean;
