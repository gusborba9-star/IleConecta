export const PERIODS: number[];
export const GROUPS: string[];
export interface IndicatorDef { group: string; label: string; unit: "n" | "pct" | "min" | "brl" | "nota"; better: "up" | "down"; definition: string; source: string; money?: boolean; snapshot?: boolean }
export const INDICATORS: Record<string, IndicatorDef>;
export interface IndicatorValue { current: number | null; previous: number | null }
export interface HouseIndicatorsView { days: number; role: "titular" | "equipe"; totalFollowers: number; items: Record<string, IndicatorValue> }
export function readHouseIndicators(raw: unknown): HouseIndicatorsView;
export function formatIndicator(key: string, value: number | null | undefined): string;
export function changeInfo(key: string, current: number | null | undefined, previous: number | null | undefined): { text: string; tone: "good" | "bad" | "none" };
export function groupedIndicators(view: HouseIndicatorsView): { group: string; items: (IndicatorDef & IndicatorValue & { key: string })[] }[];
