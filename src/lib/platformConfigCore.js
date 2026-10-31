// Regras puras da configuração da plataforma (sem rede), testáveis em Node.
// O painel admin grava estes dados no banco; qualquer valor inválido volta ao padrão aqui.

export const FEATURE_KEYS = ["assistant", "boost", "highlight", "payments", "ritual_video", "referral", "reviews"];
export const SCOPE_KEYS = ["cidade", "estado", "pais", "exterior"];
export const PLAN_IDS = ["base", "intermediario", "maximo"];
export const FEATURE_STATES = ["off", "beta", "on"];

export const DEFAULT_CONFIG = {
  features: {
    assistant: { state: "on", beta_houses: [] },
    boost: { state: "on", beta_houses: [] },
    highlight: { state: "on", beta_houses: [] },
    // Dinheiro só com ligação explícita: o padrão é DESLIGADO (igual a payments_enabled() no banco).
    payments: { state: "off", beta_houses: [] },
    // Vídeo de 30 s nos registros do ritual: desligado até o plano Pro do banco (só casas Premium).
    ritual_video: { state: "off", beta_houses: [] },
    // "Indique e ganhe" entre casas: construído, mas desligado até o admin ativar ("beta" não vale aqui: só liga ou desliga).
    referral: { state: "off", beta_houses: [] },
    // Avaliações de quem comprou: construídas e desligadas (só vale com "Ligado para todos").
    reviews: { state: "off", beta_houses: [] },
  },
  // Prêmio da indicação: dias de destaque para quem indicou, para a casa indicada (0 = nenhum) e limite por mês.
  referral: { reward_days: 7, referred_days: 0, monthly_cap: 3 },
  pricing: {
    plans: {
      base: { name: "Essencial", monthly: 89.9 },
      intermediario: { name: "Profissional", monthly: 139.9 },
      maximo: { name: "Premium", monthly: 199 },
    },
    boost_per_day: { cidade: 19.9, estado: 29.9, pais: 39.9, exterior: null },
    highlight_per_day: { cidade: 29.9, estado: 39.9, pais: 49.9, exterior: null },
  },
  scopes: {
    boost: { cidade: true, estado: true, pais: false, exterior: false },
    highlight: { cidade: true, estado: true, pais: false, exterior: false },
  },
};

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function money(v, fallback) {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : fallback;
}

/** Aceita qualquer coisa vinda do banco e devolve uma configuração sempre válida. */
export function sanitizeConfig(raw) {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_CONFIG;

  const features = {};
  for (const k of FEATURE_KEYS) {
    const f = isRecord(r.features) && isRecord(r.features[k]) ? r.features[k] : {};
    features[k] = {
      state: FEATURE_STATES.includes(f.state) ? f.state : d.features[k].state,
      beta_houses: Array.isArray(f.beta_houses) ? f.beta_houses.filter((x) => typeof x === "string").slice(0, 200) : [],
    };
  }

  const p = isRecord(r.pricing) ? r.pricing : {};
  const plans = {};
  for (const id of PLAN_IDS) {
    const x = isRecord(p.plans) && isRecord(p.plans[id]) ? p.plans[id] : {};
    plans[id] = {
      name: typeof x.name === "string" && x.name.trim() ? x.name.trim().slice(0, 30) : d.pricing.plans[id].name,
      monthly: money(x.monthly, d.pricing.plans[id].monthly),
    };
  }
  const perDay = (key) => {
    const out = {};
    for (const s of SCOPE_KEYS) out[s] = money(isRecord(p[key]) ? p[key][s] : undefined, d.pricing[key][s]);
    return out;
  };

  const sc = isRecord(r.scopes) ? r.scopes : {};
  const scopes = {};
  for (const kind of ["boost", "highlight"]) {
    scopes[kind] = {};
    for (const s of SCOPE_KEYS) {
      const v = isRecord(sc[kind]) ? sc[kind][s] : undefined;
      scopes[kind][s] = typeof v === "boolean" ? v : d.scopes[kind][s];
    }
  }

  const rf = isRecord(r.referral) ? r.referral : {};
  const whole = (v, min, max, fallback) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback);
  const referral = {
    reward_days: whole(rf.reward_days, 1, 90, d.referral.reward_days),
    referred_days: whole(rf.referred_days, 0, 90, d.referral.referred_days),
    monthly_cap: whole(rf.monthly_cap, 1, 100, d.referral.monthly_cap),
  };

  return { features, pricing: { plans, boost_per_day: perDay("boost_per_day"), highlight_per_day: perDay("highlight_per_day") }, scopes, referral };
}

/** Recurso ligado? "beta" liga só para as casas listadas (ids dos donos). */
export function isFeatureOn(config, key, ownerId) {
  const f = config?.features?.[key];
  if (!f) return false;
  if (f.state === "on") return true;
  if (f.state === "beta") return Boolean(ownerId) && f.beta_houses.includes(ownerId);
  return false;
}

/** Regiões que a casa pode contratar: ligadas no painel e com preço definido. */
export function availableScopes(config, kind) {
  const priceKey = kind === "boost" ? "boost_per_day" : "highlight_per_day";
  return SCOPE_KEYS.filter((s) => config.scopes[kind][s] && config.pricing[priceKey][s] !== null);
}
