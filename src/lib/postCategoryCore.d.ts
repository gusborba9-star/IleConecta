export type PostCategory = "geral" | "evento" | "aviso" | "ensinamento";
export const CATEGORIES: { id: Exclude<PostCategory, "geral">; label: string }[];
export function normalizeCategory(v: unknown): PostCategory;
export function categoryLabel(v: unknown): string | null;
export function sameCity(a: unknown, b: unknown): boolean;
export function matchesFilter(filter: string, p: { category?: unknown; authorCity?: unknown; viewerCity?: unknown }): boolean;
