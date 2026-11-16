export const PERIODS: number[];
export const GROUPS: string[];
export const PLAN_LABELS: Record<string, string>;
export interface IndicatorDef { group: string; label: string; unit: "n" | "pct" | "h" | "brl" | "tok"; better: "up" | "down" | "none"; definition: string; source: string; snapshot?: boolean }
export const INDICATORS: Record<string, IndicatorDef>;
export interface IndicatorValue { current: number | null; previous: number | null }
export interface AdminIndicatorsView { days: number; items: Record<string, IndicatorValue>; plans: { plan: string; label: string; count: number }[] }
export function readAdminIndicators(raw: unknown): AdminIndicatorsView;
export function formatIndicator(key: string, value: number | null | undefined): string;
export function changeInfo(key: string, current: number | null | undefined, previous: number | null | undefined): { text: string; tone: "good" | "bad" | "none" };
export function groupedIndicators(view: AdminIndicatorsView): { group: string; items: (IndicatorDef & IndicatorValue & { key: string })[] }[];
