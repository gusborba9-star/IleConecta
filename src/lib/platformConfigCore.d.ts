export type FeatureKey = "assistant" | "boost" | "highlight";
export type ScopeKey = "cidade" | "estado" | "pais" | "exterior";
export type PlanId = "base" | "intermediario" | "maximo";
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
    boost_per_day: Record<ScopeKey, Money>;
    highlight_per_day: Record<ScopeKey, Money>;
  };
  scopes: { boost: Record<ScopeKey, boolean>; highlight: Record<ScopeKey, boolean> };
}

export const FEATURE_KEYS: FeatureKey[];
export const SCOPE_KEYS: ScopeKey[];
export const PLAN_IDS: PlanId[];
export const FEATURE_STATES: FeatureState[];
export const DEFAULT_CONFIG: PlatformConfig;
export function sanitizeConfig(raw: unknown): PlatformConfig;
export function isFeatureOn(config: PlatformConfig, key: FeatureKey, ownerId?: string): boolean;
export function availableScopes(config: PlatformConfig, kind: "boost" | "highlight"): ScopeKey[];
