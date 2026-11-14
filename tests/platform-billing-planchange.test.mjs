// Contratação de plano no app: assinar e subir de plano (banco e provedor simulados) + leitura do status para a tela.
import test from "node:test";
import assert from "node:assert/strict";
import { subscribe, upgrade } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";
import { readPlanChange, PLAN_RANK } from "../src/lib/planChangeCore.ts";

const HOUSE = "22222222-2222-2222-2222-222222222222", CH = "11111111-1111-1111-1111-111111111111";
const silent = { error() {}, log() {} };

function setup({ issue = CH } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const calls = { sub: [], up: [], attach: [] };
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" }, methods: { plan: ["pix", "card"] } }),
    houseOfOwner: async (u) => (u === "u1" ? HOUSE : null),
    houseOwner: async () => "u1",
    subscribeIssue: async (h, p) => { calls.sub.push([h, p]); if (issue instanceof Error) throw issue; return issue; },
    upgradeIssue: async (h, p) => { calls.up.push([h, p]); if (issue instanceof Error) throw issue; return issue; },
    chargeById: async (id) => ({ id, house_id: HOUSE, kind: "plan", status: "aberta", amount_cents: 17990, description: "Assinatura do plano", due_date: "2026-11-14", provider: null, provider_ref: null }),
    attach: async (...a) => { calls.attach.push(a); },
  };
  return { registry, store, calls };
}
const args = (t, extra = {}) => ({ registry: t.registry, store: t.store, userId: "u1", plan: "maximo", method: "pix", email: "a@b.c", appUrl: "https://x.test", log: silent, ...extra });

test("só a casa assina ou sobe de plano", async () => {
  for (const fn of [subscribe, upgrade]) {
    const t = setup();
    await assert.rejects(() => fn(args(t, { userId: "u9" })), (e) => e.code === "forbidden");
    assert.equal(t.calls.sub.length + t.calls.up.length, 0);
  }
});

test("plano sem mensalidade (base) ou inventado nunca chega ao banco", async () => {
  for (const plan of ["base", "gratis", null, undefined, "MAXIMO"]) {
    const t = setup();
    await assert.rejects(() => subscribe(args(t, { plan })), (e) => e.code === "plan_change_denied");
    await assert.rejects(() => upgrade(args(t, { plan })), (e) => e.code === "plan_change_denied");
    assert.equal(t.calls.sub.length + t.calls.up.length, 0);
  }
});

test("cada ação chama a emissão certa com a casa e o plano", async () => {
  const t = setup();
  await subscribe(args(t, { plan: "intermediario" })).catch(() => {});
  await upgrade(args(t, { plan: "maximo" })).catch(() => {});
  assert.deepEqual(t.calls.sub, [[HOUSE, "intermediario"]]);
  assert.deepEqual(t.calls.up, [[HOUSE, "maximo"]]);
});

test("recusas conhecidas do banco viram mensagem clara; erro desconhecido não vaza", async () => {
  const known = ["A fatura da próxima renovação já foi gerada. A troca fica disponível depois.", "Há uma fatura em atraso. Regularize o pagamento antes de trocar de plano.", "Nos 7 dias do primeiro pagamento a troca de plano fica indisponível.", "A casa já tem assinatura ativa. Use a troca de plano.", "A cobrança da plataforma ainda não está ativa.", "A renovação está muito próxima e a diferença fica abaixo do valor mínimo de cobrança."];
  for (const m of known) for (const fn of [subscribe, upgrade]) {
    const t = setup({ issue: new Error(m) });
    await assert.rejects(() => fn(args(t)), (e) => e.code === "plan_change_denied" && e.message === m);
  }
  for (const fn of [subscribe, upgrade]) {
    const t = setup({ issue: new Error('relation "platform_charges" does not exist') });
    await assert.rejects(() => fn(args(t)), (e) => e.code !== "plan_change_denied" && /relation/.test(e.message ?? ""));
  }
});

test("resposta inesperada do banco não abre pagamento", async () => {
  const t = setup({ issue: null });
  await assert.rejects(() => subscribe(args(t)), (e) => e.code === "plan_change_denied");
});

test("fatura de outra casa não é paga por aqui", async () => {
  const t = setup();
  t.store.houseOwner = async () => "outro";
  await assert.rejects(() => upgrade(args(t)), (e) => e.code === "forbidden");
});

test("leitura do status para a tela", () => {
  assert.equal(readPlanChange(null), null);
  assert.equal(readPlanChange({ has_house: false }), null);
  assert.equal(readPlanChange({ has_house: true, plan: "estranho" }), null);
  const ns = readPlanChange({ has_house: true, subscribed: false, cancelled: false, plan: "base" });
  assert.equal(ns.subscribed, false); assert.equal(ns.pendingPlan, null); assert.deepEqual(ns.upgrades, {});
  const s = readPlanChange({ has_house: true, subscribed: true, cancelled: false, plan: "intermediario", pending_plan: "base", pending_on: "2026-12-14",
    upgrades: { maximo: { plan: "maximo", amount_cents: 6000, old_cents: 17990, new_cents: 29990, days_left: 15, days_total: 30, cycle_end: "2026-11-29" }, intermediario: { amount_cents: 0 }, lixo: { amount_cents: 999999 } },
    upgrade_blocked: { maximo: "x", xyz: "y" }, downgrade_blocked: null });
  assert.equal(s.pendingPlan, "base"); assert.equal(s.pendingOn, "2026-12-14");
  assert.equal(s.upgrades.maximo.amountCents, 6000); assert.equal(s.upgrades.maximo.daysLeft, 15);
  assert.equal(s.upgrades.intermediario, undefined, "cotação abaixo do mínimo é ignorada");
  assert.equal(s.upgrades.lixo, undefined, "plano desconhecido é ignorado");
  assert.deepEqual(s.upgradeBlocked, { maximo: "x" });
  assert.ok(PLAN_RANK.maximo > PLAN_RANK.intermediario && PLAN_RANK.intermediario > PLAN_RANK.base);
});
