import type { PlanMatrix } from "@/lib/planMatrixCore";
export type FeatureKey = "assistant" | "boost" | "highlight" | "payments" | "ritual_video" | "referral" | "reviews" | "calendar";
export type ScopeKey = "cidade" | "estado" | "pais" | "exterior";
/** Planos com mensalidade (cobrança e tabela de preços): base = Essencial. */
export type PlanId = "base" | "intermediario" | "maximo";
/** Plano da casa: inclui o Grátis (sem mensalidade nem preço). */
export type HousePlanId = "gratis" | PlanId;
export type FeatureState = "off" | "beta" | "on";
export type Money = number | null;

export interface FeatureFlag {
  state: FeatureState;
  beta_houses: string[];
}
export interface PlatformConfig {
  features: Record<FeatureKey, FeatureFlag>;
  pricing: {
    plans: Record<PlanId, { name: string; monthly: Money }>;
    extra_seat: Record<PlanId, Money>;
    boost_per_day: Record<ScopeKey, Money>;
    highlight_per_day: Record<ScopeKey, Money>;
  };
  scopes: { boost: Record<ScopeKey, boolean>; highlight: Record<ScopeKey, boolean> };
  referral: { reward_days: number; referred_days: number; monthly_cap: number };
  plan_matrix: PlanMatrix;
}

export declare const FEATURE_KEYS: FeatureKey[];
export declare const SCOPE_KEYS: ScopeKey[];
export declare const PLAN_IDS: PlanId[];
/** Todos os planos de uma casa, do menor para o maior. */
export declare const HOUSE_PLAN_IDS: HousePlanId[];
/** Nome de cada plano na tela (o Grátis não tem preço, então o nome fica aqui). */
export declare const FREE_PLAN_NAME: string;
export declare const FEATURE_STATES: FeatureState[];
export declare const DEFAULT_CONFIG: PlatformConfig;
export declare function sanitizeConfig(raw: unknown): PlatformConfig;
export declare function isFeatureOn(config: PlatformConfig, key: FeatureKey, ownerId?: string): boolean;
export declare function availableScopes(config: PlatformConfig, kind: "boost" | "highlight"): ScopeKey[];
