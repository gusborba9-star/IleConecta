export interface FilterState { modo: string; quando: string; preco: string; vaga: boolean; verificada: boolean; nota: boolean }
export interface FilterRow { id: string; mode: string; startsAt: string; priceCents: number; seatsTotal: number; ownerId: string | null; houseVerified?: boolean }
export interface FilterCtx { now?: number; taken?: Record<string, number>; rating?: (ownerId: string | null) => number }
export interface Facet { id: string; label: string; kind: "one" | "flag"; options?: { id: string; label: string; count: number }[]; count?: number; show: boolean }
export const TZ: string;
export const MODES: { id: string; label: string }[];
export const WHEN: { id: string; label: string }[];
export const PRICES: { id: string; label: string; min: number; max: number }[];
export const EMPTY: FilterState;
export const MIN_RATING: number;
export function tzOffsetMin(ms: number, tz?: string): number;
export function startOfDay(ms: number, tz?: string): number;
export function startOfNextMonth(ms: number, tz?: string): number;
export function whenRange(id: string, now?: number): [number, number] | null;
export function applyFilters<T extends FilterRow>(list: T[], f: Partial<FilterState>, ctx?: FilterCtx): T[];
export function facets<T extends FilterRow>(list: T[], f: Partial<FilterState>, ctx?: FilterCtx): Facet[];
export function toParams(f: Partial<FilterState>): URLSearchParams;
export function fromParams(p: URLSearchParams): FilterState;
export function activeCount(f: Partial<FilterState>): number;
export function splitBoosted<T extends { id: string }>(list: T[], boostedIds: Set<string> | string[]): { boosted: T[]; organic: T[] };
