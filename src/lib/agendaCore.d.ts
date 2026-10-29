export declare const TZ: string;
export declare const WEEKDAYS: { id: number; label: string }[];
export declare function validateWindow(start: string, end: string): string | null;
export declare function partsInBrasilia(iso: string): { day: string; time: string };
export declare function formatSlot(iso: string): string;
export declare function groupSlots(isoList: string[]): { day: string; label: string; slots: { iso: string; time: string }[] }[];
export declare function brasiliaToIso(day: string, time: string): string;
