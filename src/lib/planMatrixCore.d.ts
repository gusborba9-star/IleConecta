import type { PlanId } from "@/lib/platformConfigCore";
export type CapNumberKey = "assistant_replies" | "campaign_links" | "campaign_card_styles" | "quick_replies" | "included_seats";
export type CapFlagKey = "assistant_sells" | "assistant_discount" | "chat_media" | "members_area" | "calendar_full" | "campaign_daily_count" | "campaign_insights_full" | "ritual_video";
export type PlanCaps = Record<CapNumberKey, number> & Record<CapFlagKey, boolean>;
export interface Benefit { text: string; feature: string | null }
export interface PlanCopy { tagline: string; benefits: Benefit[] }
export interface PlanMatrix { caps: Record<PlanId, PlanCaps>; copy: Record<PlanId, PlanCopy> }
export declare const CAP_NUMBERS: Record<CapNumberKey, [number, number, string]>;
export declare const CAP_FLAGS: Record<CapFlagKey, string>;
export declare const CAP_NUMBER_KEYS: CapNumberKey[];
export declare const CAP_FLAG_KEYS: CapFlagKey[];
export declare const DEFAULT_PLAN_MATRIX: PlanMatrix;
export declare function sanitizePlanMatrix(raw: unknown): PlanMatrix;
export declare function planCap(matrix: PlanMatrix | null | undefined, plan: string | null | undefined, key: CapNumberKey): number;
export declare function planCap(matrix: PlanMatrix | null | undefined, plan: string | null | undefined, key: CapFlagKey): boolean;
export declare function renderBenefit(text: string, caps: Partial<PlanCaps> | null | undefined): string;
export declare function benefitsFor(matrix: PlanMatrix | null | undefined, plan: PlanId, isOn: (feature: string) => boolean): { text: string; isNew: boolean }[];
export declare const cloneDefaultMatrix: () => PlanMatrix;
