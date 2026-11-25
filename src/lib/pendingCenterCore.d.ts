export const KIND_LABELS: Record<string, string>;
export const PRIORITY_LABELS: Record<string, string>;
export const TAB_TARGET: Record<string, { section: string; screen: string; label: string }>;
export interface PendingItem { kind: string; refId: string; houseId: string | null; houseName: string | null; title: string; detail: string; priority: "urgente" | "alta" | "normal"; dueAt: string | null; overdue: boolean; since: string | null; tab: string | null }
export interface PendingView { total: number; overdue: number; shown: number; counts: Record<string, number>; items: PendingItem[]; generatedAt: string | null }
export function readPending(raw: unknown): PendingView;
export function dueText(dueAt: string | null, now?: number): string;
export function filterPending(items: PendingItem[], f?: { kind?: string; onlyOverdue?: boolean; priority?: string }): PendingItem[];
