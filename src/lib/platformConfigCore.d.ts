export type FeatureKey = "assistant" | "boost" | "highlight" | "payments" | "ritual_video";
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

export declare const FEATURE_KEYS: FeatureKey[];
export declare const SCOPE_KEYS: ScopeKey[];
export declare const PLAN_IDS: PlanId[];
export declare const FEATURE_STATES: FeatureState[];
export declare const DEFAULT_CONFIG: PlatformConfig;
export declare function sanitizeConfig(raw: unknown): PlatformConfig;
export declare function isFeatureOn(config: PlatformConfig, key: FeatureKey, ownerId?: string): boolean;
export declare function availableScopes(config: PlatformConfig, kind: "boost" | "highlight"): ScopeKey[];
