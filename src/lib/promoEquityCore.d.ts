export interface EquityItem { houseId: string; name: string; views: number; activeDays: number; exposure: number; share: number }
export interface EquityGroup { group: string; scope: string; place: string; houses: number; totalViews: number; median: number; top: number; ratio: number | null; items: EquityItem[] }
export function groupLabel(g: unknown): { scope: string; place: string };
export function readEquity(raw: unknown): EquityGroup[];
export function describeEquity(g: EquityGroup): string;
