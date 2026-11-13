import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_PLAN_MATRIX, CAP_NUMBER_KEYS, CAP_FLAG_KEYS, sanitizePlanMatrix, planCap, renderBenefit, benefitsFor, cloneDefaultMatrix } from "../src/lib/planMatrixCore.js";
import { DEFAULT_CONFIG, sanitizeConfig } from "../src/lib/platformConfigCore.js";
import { PLAN_LIMITS, planLimits, checkGate, canSell, allowedDiscountPercent } from "../supabase/functions/assistant-chat/logic.js";

const clone = () => cloneDefaultMatrix();

test("a matriz inicial tem todas as chaves nos três planos", () => {
  for (const plan of ["base", "intermediario", "maximo"]) {
    const keys = Object.keys(DEFAULT_PLAN_MATRIX.caps[plan]).sort();
    assert.deepEqual(keys, [...CAP_NUMBER_KEYS, ...CAP_FLAG_KEYS].sort(), plan);
    assert.ok(DEFAULT_PLAN_MATRIX.copy[plan].tagline.length > 0);
  }
});

test("os valores iniciais batem com o que já valia antes da matriz", () => {
  const c = DEFAULT_PLAN_MATRIX.caps;
  assert.deepEqual([c.base.campaign_links, c.intermediario.campaign_links, c.maximo.campaign_links], [0, 2, 30]);
  assert.deepEqual([c.base.quick_replies, c.intermediario.quick_replies, c.maximo.quick_replies], [0, 3, 50]);
  assert.deepEqual([c.base.campaign_card_styles, c.intermediario.campaign_card_styles, c.maximo.campaign_card_styles], [0, 1, 3]);
  assert.deepEqual([c.base.included_seats, c.intermediario.included_seats, c.maximo.included_seats], [0, 0, 1]);
  assert.deepEqual([c.base.assistant_replies, c.intermediario.assistant_replies, c.maximo.assistant_replies], [0, 300, 3000]);
  for (const k of ["chat_media", "members_area", "calendar_full", "campaign_daily_count", "campaign_insights_full", "ritual_video", "assistant_discount"]) {
    assert.deepEqual([c.base[k], c.intermediario[k], c.maximo[k]], [false, false, true], k);
  }
  assert.deepEqual([c.base.assistant_sells, c.intermediario.assistant_sells, c.maximo.assistant_sells], [false, true, true]);
});

test("anti-divergência: o padrão do código é idêntico ao plan_matrix_default() do banco", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0092_planos_e_foto_da_assistente.sql", import.meta.url), "utf8"); // definição vigente (a 0092 reescreveu o texto da 0085)
  const m = sql.match(/select '(\{"caps".*?\})'::jsonb;/s);
  assert.ok(m, "semente não encontrada");
  assert.deepEqual(JSON.parse(m[1]), DEFAULT_PLAN_MATRIX);
});

test("anti-divergência: a assistente (constantes de reserva) bate com a matriz inicial", () => {
  for (const plan of ["base", "intermediario", "maximo"]) {
    const c = DEFAULT_PLAN_MATRIX.caps[plan];
    assert.deepEqual(PLAN_LIMITS[plan], { monthlyReplies: c.assistant_replies, canSell: c.assistant_sells, canDiscount: c.assistant_discount }, plan);
  }
});

test("sanitize: lixo vira a matriz inicial; campo inválido volta só ele", () => {
  assert.deepEqual(sanitizePlanMatrix(null), DEFAULT_PLAN_MATRIX);
  assert.deepEqual(sanitizePlanMatrix("x"), DEFAULT_PLAN_MATRIX);
  assert.deepEqual(sanitizePlanMatrix([]), DEFAULT_PLAN_MATRIX);
  const m = clone(); m.caps.base.campaign_links = 5; m.caps.maximo.quick_replies = "50"; m.caps.maximo.chat_media = "sim"; m.caps.intermediario.assistant_replies = 1.5;
  const s = sanitizePlanMatrix(m);
  assert.equal(s.caps.base.campaign_links, 5);
  assert.equal(s.caps.maximo.quick_replies, 50);
  assert.equal(s.caps.maximo.chat_media, true);
  assert.equal(s.caps.intermediario.assistant_replies, 300);
});

test("sanitize respeita as faixas", () => {
  const m = clone(); m.caps.base.campaign_links = 201; m.caps.base.quick_replies = -1; m.caps.maximo.assistant_replies = 100001; m.caps.maximo.included_seats = 21;
  const s = sanitizePlanMatrix(m);
  assert.equal(s.caps.base.campaign_links, 0);
  assert.equal(s.caps.base.quick_replies, 0);
  assert.equal(s.caps.maximo.assistant_replies, 3000);
  assert.equal(s.caps.maximo.included_seats, 1);
});

test("sanitize dos textos: vazio, longo, lista demais, ferramenta desconhecida", () => {
  const m = clone();
  m.copy.base.tagline = "   ";
  m.copy.intermediario.benefits = [{ text: "ok", feature: "segredo" }, { text: "  ", feature: null }, { text: 5 }, "solto", { text: "x".repeat(300), feature: "ritual_video" }];
  m.copy.maximo.benefits = Array.from({ length: 20 }, (_, i) => ({ text: "item " + i, feature: null }));
  const s = sanitizePlanMatrix(m);
  assert.equal(s.copy.base.tagline, DEFAULT_PLAN_MATRIX.copy.base.tagline);
  assert.deepEqual(s.copy.intermediario.benefits.map((b) => b.feature), [null, "ritual_video"]);
  assert.equal(s.copy.intermediario.benefits[1].text.length, 200);
  assert.equal(s.copy.maximo.benefits.length, 12);
  m.copy.base.benefits = [];
  assert.deepEqual(sanitizePlanMatrix(m).copy.base.benefits, []);
});

test("planCap: plano ou chave desconhecidos valem como o Essencial (o mais restrito)", () => {
  const m = DEFAULT_PLAN_MATRIX;
  assert.equal(planCap(m, "maximo", "campaign_links"), 30);
  assert.equal(planCap(m, "xx", "campaign_links"), 0);
  assert.equal(planCap(m, "xx", "members_area"), false);
  assert.equal(planCap(m, null, "chat_media"), false);
  assert.equal(planCap(null, "maximo", "chat_media"), true);
  assert.equal(planCap(m, "maximo", "nao_existe"), undefined);
});

test("texto com números calculados; chave desconhecida some; item zerado não aparece", () => {
  assert.equal(renderBenefit("Até {campaign_links} links", { campaign_links: 30 }), "Até 30 links");
  assert.equal(renderBenefit("Olá {segredo} e {__proto__}", { campaign_links: 1 }), "Olá  e ");
  assert.equal(renderBenefit("{assistant_replies}", {}), "");
  const m = clone();
  m.copy.base.benefits = [{ text: "Até {campaign_links} links", feature: null }, { text: "Sempre aparece", feature: null }];
  assert.deepEqual(benefitsFor(m, "base", () => true).map((b) => b.text), ["Sempre aparece"]);
  m.caps.base.campaign_links = 4;
  assert.deepEqual(benefitsFor(m, "base", () => true).map((b) => b.text), ["Até 4 links", "Sempre aparece"]);
});

test("o vídeo de 30 s só aparece com o interruptor ligado, e aparece como novidade", () => {
  const off = benefitsFor(DEFAULT_PLAN_MATRIX, "maximo", () => false);
  assert.ok(!off.some((b) => /Vídeo de 30/.test(b.text)));
  assert.ok(off.every((b) => !b.isNew));
  const on = benefitsFor(DEFAULT_PLAN_MATRIX, "maximo", (f) => f === "ritual_video");
  const v = on.find((b) => /Vídeo de 30/.test(b.text));
  assert.ok(v && v.isNew);
  // nos outros planos nada muda
  assert.deepEqual(benefitsFor(DEFAULT_PLAN_MATRIX, "base", () => true).length, DEFAULT_PLAN_MATRIX.copy.base.benefits.length);
});

test("a página de planos nunca mostra '{...}' nem 'undefined' nem 'NaN'", () => {
  for (const plan of ["base", "intermediario", "maximo"]) for (const b of benefitsFor(DEFAULT_PLAN_MATRIX, plan, () => true)) assert.ok(!/[{}]|undefined|NaN/.test(b.text), b.text);
});

test("a matriz entra na configuração da plataforma e nunca falta", () => {
  assert.deepEqual(DEFAULT_CONFIG.plan_matrix, DEFAULT_PLAN_MATRIX);
  assert.deepEqual(sanitizeConfig({}).plan_matrix, DEFAULT_PLAN_MATRIX);
  assert.deepEqual(sanitizeConfig(undefined).plan_matrix, DEFAULT_PLAN_MATRIX);
  const edited = clone(); edited.caps.base.quick_replies = 2;
  assert.equal(sanitizeConfig({ plan_matrix: edited }).plan_matrix.caps.base.quick_replies, 2);
});

test("assistente: limites vêm da matriz; matriz ausente ou inválida cai nas constantes", () => {
  assert.deepEqual(planLimits("intermediario", null), PLAN_LIMITS.intermediario);
  assert.deepEqual(planLimits("intermediario", DEFAULT_PLAN_MATRIX), PLAN_LIMITS.intermediario);
  const m = clone(); m.caps.intermediario.assistant_replies = 500; m.caps.intermediario.assistant_discount = true;
  assert.deepEqual(planLimits("intermediario", m), { monthlyReplies: 500, canSell: true, canDiscount: true });
  for (const bad of [{}, { caps: null }, { caps: { intermediario: { assistant_replies: "300", assistant_sells: true, assistant_discount: false } } }, { caps: { intermediario: { assistant_replies: -1, assistant_sells: true, assistant_discount: false } } }, { caps: { intermediario: { assistant_replies: 5, assistant_sells: 1, assistant_discount: false } } }]) {
    assert.deepEqual(planLimits("intermediario", bad), PLAN_LIMITS.intermediario, JSON.stringify(bad));
  }
  assert.deepEqual(planLimits("xx", DEFAULT_PLAN_MATRIX), PLAN_LIMITS.base);
});

test("assistente: mudar a matriz muda o bloqueio de cota, a venda e o desconto", () => {
  const assistant = { enabled: true, can_sell: true, can_discount: true, max_discount_percent: 10 };
  const gate = (plan, used, matrix) => checkGate({ plan, assistant, usedThisMonth: used, usedByUserInWindow: 0, matrix });
  assert.equal(gate("intermediario", 299, DEFAULT_PLAN_MATRIX), null);
  assert.equal(gate("intermediario", 300, DEFAULT_PLAN_MATRIX), "cota_mensal");
  const m = clone(); m.caps.intermediario.assistant_replies = 400;
  assert.equal(gate("intermediario", 300, m), null);
  assert.equal(gate("intermediario", 400, m), "cota_mensal");
  assert.equal(gate("base", 0, DEFAULT_PLAN_MATRIX), "plano_sem_assistente");
  m.caps.base.assistant_replies = 50;
  assert.equal(gate("base", 0, m), null);
  assert.equal(allowedDiscountPercent("intermediario", assistant, DEFAULT_PLAN_MATRIX), 0);
  m.caps.intermediario.assistant_discount = true;
  assert.equal(allowedDiscountPercent("intermediario", assistant, m), 10);
  assert.equal(canSell("base", assistant, DEFAULT_PLAN_MATRIX), false);
  m.caps.base.assistant_sells = true;
  assert.equal(canSell("base", assistant, m), true);
  // a casa continua mandando: sem a opção da casa, a matriz sozinha não libera
  assert.equal(allowedDiscountPercent("maximo", { ...assistant, can_discount: false }, DEFAULT_PLAN_MATRIX), 0);
  assert.equal(canSell("maximo", { ...assistant, can_sell: false }, DEFAULT_PLAN_MATRIX), false);
});
