// Plano Plus (0205/0206, 24/11/2026): o vídeo é exclusivo do Plus; o Plus nasce sem preço e fora da venda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_PLAN_MATRIX, compareRows, minPlanFor, planCap, sanitizePlanMatrix } from "../src/lib/planMatrixCore.js";
import { DEFAULT_CONFIG, sanitizeConfig, sellablePlanIds, visiblePlanIds } from "../src/lib/platformConfigCore.js";
import { PLAN_RANK, readPlanChange } from "../src/lib/planChangeCore.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sql = read("../supabase/migrations/0206_plano_plus.sql").replace(/^--.*$/gm, "");

test("o Plus nasce sem mensalidade: não está à venda e a tela não o mostra a quem não tem", () => {
  assert.equal(DEFAULT_CONFIG.pricing.plans.plus.monthly, null);
  assert.deepEqual(sellablePlanIds(DEFAULT_CONFIG), ["base", "intermediario", "maximo"]);
  assert.deepEqual(visiblePlanIds(DEFAULT_CONFIG, "base"), ["gratis", "base", "intermediario", "maximo"]);
  assert.deepEqual(visiblePlanIds(DEFAULT_CONFIG, null), ["gratis", "base", "intermediario", "maximo"]);
});

test("casa piloto com Plus (atribuído pela administração) enxerga o próprio plano; com preço definido, todos veem", () => {
  assert.deepEqual(visiblePlanIds(DEFAULT_CONFIG, "plus"), ["gratis", "base", "intermediario", "maximo", "plus"]);
  const c = sanitizeConfig({ pricing: { plans: { plus: { name: "Plus", monthly: 399.9 } } } });
  assert.deepEqual(sellablePlanIds(c), ["base", "intermediario", "maximo", "plus"]);
  assert.deepEqual(visiblePlanIds(c, null).slice(-1), ["plus"]);
});

test("o vídeo é exclusivo do Plus: só ele tem minutos e a ferramenta aponta para ele", () => {
  for (const p of ["gratis", "base", "intermediario", "maximo"]) assert.equal(planCap(DEFAULT_PLAN_MATRIX, p, "video_minutes_month"), 0, p);
  assert.ok(planCap(DEFAULT_PLAN_MATRIX, "plus", "video_minutes_month") > 0);
  assert.equal(minPlanFor(DEFAULT_PLAN_MATRIX, "video_minutes_month"), "plus");
});

test("o Plus inclui tudo do Premium e mais: nunca fica abaixo dele", () => {
  const m = DEFAULT_PLAN_MATRIX.caps.maximo, p = DEFAULT_PLAN_MATRIX.caps.plus;
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "boolean") assert.ok(!v || p[k], k);
    else if (!["limit_services", "limit_rituals", "limit_posts_month"].includes(k)) assert.ok(p[k] >= v, k);
  }
  assert.equal(PLAN_RANK.plus, 4);
  assert.ok(PLAN_RANK.plus > PLAN_RANK.maximo);
});

test("tabela de comparação: o Plus só vira coluna quando a tela manda", () => {
  const sem = compareRows(DEFAULT_PLAN_MATRIX);
  assert.equal(sem[0].cells.length, 4);
  assert.ok(!sem.some((r) => r.key === "video_minutes_month"), "sem Plus à venda, a linha de vídeo não aparece");
  const com = compareRows(DEFAULT_PLAN_MATRIX, () => true, ["gratis", "base", "intermediario", "maximo", "plus"]);
  assert.equal(com[0].cells.length, 5);
  assert.deepEqual(com.find((r) => r.key === "video_minutes_month").cells, ["—", "—", "—", "—", "3.000"]);
});

test("matriz vinda do banco sem o Plus volta ao padrão dele (nunca quebra a tela)", () => {
  const m = JSON.parse(JSON.stringify(DEFAULT_PLAN_MATRIX)); delete m.caps.plus; delete m.copy.plus;
  assert.deepEqual(sanitizePlanMatrix(m).caps.plus, DEFAULT_PLAN_MATRIX.caps.plus);
});

test("troca de plano lê o Plus como plano válido", () => {
  const r = readPlanChange({ has_house: true, subscribed: true, plan: "plus", upgrades: {}, upgrade_blocked: {} });
  assert.equal(r.plan, "plus");
});

test("0206: regra do vídeo na matriz, constraint e funções de plano aceitam o Plus, com conferência de cada troca", () => {
  assert.match(sql, /if plan <> 'plus' and \(v ->> 'video_minutes_month'\)::int <> 0 then return false; end if;/);
  assert.match(sql, /array\['gratis', 'base', 'intermediario', 'maximo', 'plus'\]/);
  assert.match(sql, /check \(plan = any \(array\['base','intermediario','maximo','plus'\]\)\)/);
  assert.match(sql, /when 'maximo' then 3 when 'plus' then 4 end/);
  for (const fn of ["platform_subscribe_issue", "platform_reactivation_issue", "platform_house_subscribed_by_payment", "platform_house_reactivated_by_payment", "admin_price_announce", "platform_house_upgraded_by_payment", "platform_upgrade_quote", "my_plan_change_status", "my_plan_change_schedule"])
    assert.match(sql, new RegExp(`\\('${fn}'`), fn);
  assert.match(sql, /if n = d then raise exception 'Trecho não encontrado em %', r\.fn; end if;/);
  // preço do Plus fica em branco: nada de mensalidade na migração
  assert.match(sql, /'\{"name":"Plus","monthly":null\}'/);
  assert.doesNotMatch(sql, /"monthly":\s*[0-9]/);
});

test("função de cobrança e assistente aceitam o Plus", () => {
  assert.match(read("../supabase/functions/platform-billing/core.js"), /SUBSCRIBE_PLANS = \["base", "intermediario", "maximo", "plus"\]/);
  assert.match(read("../supabase/functions/platform-billing/core.js"), /UPGRADE_PLANS = \["intermediario", "maximo", "plus"\]/);
  assert.match(read("../supabase/functions/assistant-chat/logic.js"), /plus: \{ monthlyReplies: 3400, canSell: true, canDiscount: true \}/);
});

test("painel: matriz não deixa salvar minutos de vídeo fora do Plus", () => {
  const card = read("../src/components/admin/PlanMatrixCard.tsx");
  assert.match(card, /id === "plus" \|\| draft\.caps\[id\]\.video_minutes_month === 0/);
  assert.match(card, /Os minutos de vídeo só podem ser maiores que zero no plano Plus\./);
});
