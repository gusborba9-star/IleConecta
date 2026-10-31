import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, availableScopes, isFeatureOn, sanitizeConfig } from "../src/lib/platformConfigCore.js";

test("configuração vazia ou lixo volta aos padrões", () => {
  assert.deepEqual(sanitizeConfig(undefined), DEFAULT_CONFIG);
  assert.deepEqual(sanitizeConfig("x"), DEFAULT_CONFIG);
  assert.deepEqual(sanitizeConfig({ features: 5, pricing: [], scopes: null }), DEFAULT_CONFIG);
});

test("valores inválidos são descartados campo a campo", () => {
  const c = sanitizeConfig({
    features: { boost: { state: "talvez", beta_houses: ["a", 7, "b"] } },
    pricing: { plans: { base: { name: "  ", monthly: -5 } }, boost_per_day: { cidade: "grátis", estado: 12.345, pais: null } },
    scopes: { boost: { pais: "sim" } },
  });
  assert.equal(c.features.boost.state, "on");
  assert.deepEqual(c.features.boost.beta_houses, ["a", "b"]);
  assert.equal(c.pricing.plans.base.name, "Essencial");
  assert.equal(c.pricing.plans.base.monthly, 89.9);
  assert.equal(c.pricing.boost_per_day.cidade, 19.9);
  assert.equal(c.pricing.boost_per_day.estado, 12.35);
  assert.equal(c.pricing.boost_per_day.pais, null);
  assert.equal(c.scopes.boost.pais, false);
});

test("interruptor: desligado, beta só para casas listadas, ligado para todos", () => {
  const cfg = sanitizeConfig({ features: { assistant: { state: "off" }, boost: { state: "beta", beta_houses: ["casa1"] }, highlight: { state: "on" } } });
  assert.equal(isFeatureOn(cfg, "assistant", "casa1"), false);
  assert.equal(isFeatureOn(cfg, "boost", "casa1"), true);
  assert.equal(isFeatureOn(cfg, "boost", "casa2"), false);
  assert.equal(isFeatureOn(cfg, "boost"), false);
  assert.equal(isFeatureOn(cfg, "highlight"), true);
});

test("começa só com cidade e estado; país liga pelo painel; sem preço não aparece", () => {
  assert.deepEqual(availableScopes(DEFAULT_CONFIG, "boost"), ["cidade", "estado"]);
  const on = sanitizeConfig({ scopes: { boost: { pais: true, exterior: true } } });
  assert.deepEqual(availableScopes(on, "boost"), ["cidade", "estado", "pais"]); // exterior ligado, mas sem preço
  const priced = sanitizeConfig({ scopes: { boost: { exterior: true } }, pricing: { boost_per_day: { exterior: 59.9 } } });
  assert.deepEqual(availableScopes(priced, "boost"), ["cidade", "estado", "exterior"]);
});

test("pagamentos: padrão DESLIGADO e 'beta' liga só para as casas escolhidas", () => {
  assert.equal(sanitizeConfig({}).features.payments.state, "off");
  assert.equal(isFeatureOn(sanitizeConfig({}), "payments", "casa1"), false);
  const cfg = sanitizeConfig({ features: { payments: { state: "beta", beta_houses: ["casa1"] } } });
  assert.equal(isFeatureOn(cfg, "payments", "casa1"), true);
  assert.equal(isFeatureOn(cfg, "payments", "casa2"), false);
});

test("vídeo nos registros do ritual: desligado por padrão e liga por casa em beta", () => {
  assert.equal(sanitizeConfig({}).features.ritual_video.state, "off");
  assert.equal(isFeatureOn(sanitizeConfig({}), "ritual_video", "casa1"), false);
  const cfg = sanitizeConfig({ features: { ritual_video: { state: "beta", beta_houses: ["casa1"] } } });
  assert.equal(isFeatureOn(cfg, "ritual_video", "casa1"), true);
  assert.equal(isFeatureOn(cfg, "ritual_video", "casa2"), false);
});

test("indique e ganhe: desligado por padrão e prêmio sempre dentro dos limites", () => {
  const d = sanitizeConfig({});
  assert.equal(d.features.referral.state, "off");
  assert.equal(isFeatureOn(d, "referral", "casa1"), false);
  assert.deepEqual(d.referral, { reward_days: 7, referred_days: 0, monthly_cap: 3 });
  const ok = sanitizeConfig({ referral: { reward_days: 14, referred_days: 3, monthly_cap: 5 } });
  assert.deepEqual(ok.referral, { reward_days: 14, referred_days: 3, monthly_cap: 5 });
  const bad = sanitizeConfig({ referral: { reward_days: 0, referred_days: 999, monthly_cap: "x" } });
  assert.deepEqual(bad.referral, { reward_days: 7, referred_days: 0, monthly_cap: 3 });
});
