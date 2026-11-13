// Cobrança automática do cartão salvo: rotina diária, tentativas, resultados e ações da casa (provedor e banco simulados).
import test from "node:test";
import assert from "node:assert/strict";
import { autoCharge, cardRemove, cardSetAuto, cardSetup, cardSync, sweep } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";
import { buildAutoChargeParams, buildCardSetupParams, classifyEvent, interpretAutoCharge } from "../supabase/functions/platform-billing/logic.js";
import { createStripeAdapter, fingerprint } from "../supabase/functions/platform-billing/stripeAdapter.js";

const CH = "11111111-1111-1111-1111-111111111111", HOUSE = "22222222-2222-2222-2222-222222222222";
const silent = { error() {}, log() {} };

function setup({ due = null, cfg = {}, owners = { u1: HOUSE } } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const charge = { id: CH, house_id: HOUSE, kind: "plan", amount_cents: "17990", description: "Mensalidade", status: "aberta", provider: null, provider_ref: null };
  const calls = { begin: [], result: [], attach: [], events: [], save: [], remove: 0, auto: [] };
  let cardRow = null, authorized = true;
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" }, methods: { plan: ["card", "card_recurring"] }, ...cfg }),
    autoEnabled: async () => true,
    tick: async () => ({ issued: 0 }),
    openWithRef: async () => [], paidWithoutFee: async () => [],
    autoDue: async () => (due ? [due] : []),
    autoBegin: async (id, n) => { calls.begin.push([id, n]); return true; },
    autoResult: async (...a) => { calls.result.push(a); },
    chargeById: async () => charge,
    attach: async (id, prov, ref, method, url) => { calls.attach.push([id, prov, ref, method, url]); if (charge.status === "paga") throw new Error("cobranca_cancelada"); charge.provider = prov; charge.provider_ref = ref; },
    chargeIdByRef: async (prov, ref) => (ref === charge.provider_ref ? CH : null),
    confirm: async () => { charge.status = "paga"; return { duplicate: false }; },
    progress: async () => {},
    logEvent: async (e) => { calls.events.push(e); },
    houseOfOwner: async (u) => owners[u] ?? null,
    cardAuthOk: async () => authorized,
    cardGet: async () => cardRow,
    cardCustomer: async (h, p, c) => (cardRow?.customer ?? c),
    cardSetupOpen: async () => {},
    cardSave: async (h, p, ref, cust, m) => { calls.save.push([h, ref, cust, m.id]); const prev = cardRow?.method ?? null; cardRow = { customer: cust, method: m.id }; return { already: false, previous_method: prev }; },
    cardSetAuto: async (h, on) => { if (on && !cardRow?.method) throw new Error("Cadastre um cartão antes de ligar."); return on; },
    cardRemove: async () => { calls.remove++; const m = cardRow?.method ?? null; cardRow = cardRow ? { customer: cardRow.customer, method: null } : null; return m; },
  };
  const d = { charge_id: CH, house_id: HOUSE, attempt: 1, amount_cents: "17990", due_date: "2026-11-13", provider: "fake", customer_ref: "cus_1", method_ref: "pm_1", last4: "4242" };
  return { fake, registry, store, charge, calls, d, setCard: (r) => { cardRow = r; }, setAuthorized: (v) => { authorized = v; } };
}

test("aprovada: cobra o valor da fatura, baixa a fatura pelo mesmo caminho do pagamento e registra o desfecho", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d];
  const r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(r.approved, 1);
  assert.equal(t.charge.status, "paga");
  assert.deepEqual(t.calls.attach[0].slice(0, 2), [CH, "fake"]);
  assert.equal(t.calls.attach[0][3], "card_recurring");
  assert.equal(t.calls.result[0][2], "aprovada");
  assert.equal(t.fake.calls.chargeSaved, 1);
});

test("recusada: não baixa nada, registra o desfecho com o motivo e não grava referência de pagamento", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d]; t.fake.autoScript.push("recusada");
  const r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(r.declined, 1);
  assert.equal(t.charge.status, "aberta");
  assert.equal(t.calls.attach.length, 0);
  assert.deepEqual([t.calls.result[0][2], t.calls.result[0][4]], ["recusada", "card_declined"]);
});

test("exige confirmação do banco: desfecho próprio, nada baixado", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d]; t.fake.autoScript.push("exige_acao");
  await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.calls.result[0][2], "exige_acao");
  assert.equal(t.charge.status, "aberta");
});

test("falha de rede: a tentativa fica aberta (sem desfecho) e a repetição usa a MESMA chave, sem cobrar duas vezes", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d]; t.fake.autoScript.push("erro");
  let r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.calls.result.length, 0);
  assert.equal(r.errors.length, 1);
  r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(r.approved, 1);
  const again = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.fake.autoCharges.size, 1, "uma só cobrança no provedor");
  assert.ok(again.due === 1);
});

test("a chave de idempotência é por fatura e tentativa (tentativa 2 é outra cobrança)", async () => {
  const t = setup(); t.store.autoDue = async () => [{ ...t.d, attempt: 2 }]; t.fake.autoScript.push("recusada");
  await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.deepEqual([...t.fake.autoCharges.keys()], [`pbauto:${CH}:2`]);
});

test("reserva negada (outra rotina já tentou, ou a fatura já foi paga): não cobra", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d]; t.store.autoBegin = async () => false;
  const r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.fake.calls.chargeSaved, 0);
  assert.equal(r.approved + r.declined, 0);
});

test("valor da fatura diferente do da fila: não cobra", async () => {
  const t = setup(); t.store.autoDue = async () => [{ ...t.d, amount_cents: "100" }];
  const r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.fake.calls.chargeSaved, 0);
  assert.equal(r.errors.length, 1);
});

test("cobrado mas a fatura já tinha sido paga por outro meio: registra pagamento duplicado e avisa o erro", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d]; t.charge.status = "paga";
  const r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.calls.events[0].kind, "pagamento_duplicado");
  assert.equal(r.errors.length, 1);
  assert.equal(t.calls.result[0][2], "aprovada", "o desfecho real é registrado");
});

test("em análise (processando): grava a referência e deixa a fatura em análise", async () => {
  const t = setup(); t.store.autoDue = async () => [t.d]; t.fake.autoScript.push("processando");
  const r = await autoCharge({ registry: t.registry, store: t.store, log: silent });
  assert.equal(r.pending, 1);
  assert.equal(t.calls.result[0][2], "processando");
});

test("a rotina diária inclui a cobrança automática e um erro dela não derruba o resto", async () => {
  const t = setup(); t.store.autoDue = async () => { throw new Error("banco fora"); };
  const out = await sweep({ registry: t.registry, store: t.store, log: silent });
  assert.ok(out.errors.some((e) => /auto:/.test(e)));
  assert.deepEqual(out.tick, { issued: 0 });
});

test("cadastro do cartão: abre a página, e só depois de concluída no provedor o cartão é guardado", async () => {
  const t = setup();
  const s = await cardSetup({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://app" });
  assert.match(s.url, /^https:\/\/pay\.example\//);
  const ref = [...t.fake.setups.keys()][0];
  await assert.rejects(() => cardSync({ registry: t.registry, store: t.store, userId: "u1", sessionRef: ref, log: silent }), /não foi concluído/);
  assert.equal(t.calls.save.length, 0);
  t.fake.completeSetup(ref);
  await cardSync({ registry: t.registry, store: t.store, userId: "u1", sessionRef: ref, log: silent });
  assert.deepEqual(t.calls.save[0], [HOUSE, ref, `fake_cus_${HOUSE.slice(0, 8)}`, "pm_fake"]);
});

test("cadastro de outra casa não vale; quem não tem casa não cadastra", async () => {
  const t = setup({ owners: { u1: HOUSE, u2: "33333333-3333-3333-3333-333333333333" } });
  await cardSetup({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://app" });
  const ref = [...t.fake.setups.keys()][0]; t.fake.completeSetup(ref);
  await assert.rejects(() => cardSync({ registry: t.registry, store: t.store, userId: "u2", sessionRef: ref, log: silent }), /não é da sua casa/);
  await assert.rejects(() => cardSetup({ registry: t.registry, store: t.store, userId: "u9", appUrl: "x" }), /Somente a casa/);
  assert.equal(t.calls.save.length, 0);
});

test("trocar o cartão apaga o antigo no provedor; remover limpa no banco e depois no provedor", async () => {
  const t = setup();
  await cardSetup({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://app" });
  const r1 = [...t.fake.setups.keys()][0]; t.fake.completeSetup(r1, { id: "pm_A", brand: "visa", last4: "4242", expMonth: 1, expYear: 2031 });
  await cardSync({ registry: t.registry, store: t.store, userId: "u1", sessionRef: r1, log: silent });
  await cardSetup({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://app" });
  const r2 = [...t.fake.setups.keys()][1]; t.fake.completeSetup(r2, { id: "pm_B", brand: "visa", last4: "1881", expMonth: 1, expYear: 2031 });
  await cardSync({ registry: t.registry, store: t.store, userId: "u1", sessionRef: r2, log: silent });
  assert.deepEqual(t.fake.detached, ["pm_A"]);
  await cardRemove({ registry: t.registry, store: t.store, userId: "u1", log: silent });
  assert.deepEqual(t.fake.detached, ["pm_A", "pm_B"]);
  await assert.rejects(() => cardSetAuto({ registry: t.registry, store: t.store, userId: "u1", enabled: true }), /Cadastre um cartão/);
});

test("falha do provedor ao apagar o cartão não desfaz a remoção no banco", async () => {
  const t = setup(); t.setCard({ customer: "c", method: "pm_X" });
  t.fake.detachCard = async () => { throw new Error("rede"); };
  await cardRemove({ registry: t.registry, store: t.store, userId: "u1", log: silent });
  assert.equal(t.calls.remove, 1);
});

test("cadastro indisponível quando o painel desliga o recurso", async () => {
  const t = setup(); t.store.autoEnabled = async () => false;
  await assert.rejects(() => cardSetup({ registry: t.registry, store: t.store, userId: "u1", appUrl: "x" }), /não está disponível/);
});

// ---------- regras puras e adaptador do Stripe ----------
test("pedido da cobrança automática: valor da fatura, fora de sessão, só cartão, marcada como automática", () => {
  const p = buildAutoChargeParams({ charge: { id: CH, house_id: HOUSE, kind: "plan", amount_cents: "17990", description: "Mensalidade" }, customer: "cus_1", method: "pm_1", attempt: 2 });
  assert.equal(p.amount, 17990); assert.equal(p.currency, "brl"); assert.equal(p.off_session, "true"); assert.equal(p.confirm, "true");
  assert.deepEqual(p.allowed_payment_method_types, ["card"]); assert.equal(p.payment_method_types, undefined); assert.equal(p.metadata.auto, "1"); assert.equal(p.metadata.attempt, "2");
});

test("pedido do cadastro do cartão: modo setup, só cartão, volta com o id da sessão", () => {
  const p = buildCardSetupParams({ customer: "cus_1", houseId: HOUSE, appUrl: "https://app", expiresAtSec: 99 });
  assert.equal(p.mode, "setup"); assert.deepEqual(p.allowed_payment_method_types, ["card"]); assert.equal(p.payment_method_types, undefined);
  assert.match(p.success_url, /cartao=ok&sessao=\{CHECKOUT_SESSION_ID\}/);
});

test("interpretar a resposta do Stripe: só desfechos conhecidos; erro de rede/servidor = não sabemos", () => {
  assert.equal(interpretAutoCharge({ ok: true, status: 200, data: { id: "pi_1", status: "succeeded" } }).outcome, "aprovada");
  assert.equal(interpretAutoCharge({ ok: true, status: 200, data: { id: "pi_1", status: "processing" } }).outcome, "processando");
  const act = interpretAutoCharge({ ok: true, status: 200, data: { id: "pi_1", status: "requires_action" } });
  assert.deepEqual([act.outcome, act.cancel], ["exige_acao", "pi_1"]);
  const dec = interpretAutoCharge({ ok: false, status: 402, data: { error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", payment_intent: { id: "pi_2" } } } });
  assert.deepEqual([dec.outcome, dec.code, dec.ref], ["recusada", "insufficient_funds", "pi_2"]);
  assert.equal(interpretAutoCharge({ ok: false, status: 402, data: { error: { type: "card_error", code: "authentication_required", payment_intent: { id: "pi_3" } } } }).outcome, "exige_acao");
  for (const bad of [{ ok: false, status: 500, data: {} }, { ok: false, status: 429, data: {} }, { ok: false, status: 400, data: { error: { type: "invalid_request_error" } } }, { ok: false, status: 409, data: { error: { type: "idempotency_error" } } }, { ok: true, status: 200, data: { status: "mistério" } }]) assert.equal(interpretAutoCharge(bad), null);
});

test("avisos do Stripe: payment_intent.succeeded só vale quando é cobrança automática nossa; recusa não vira aviso", () => {
  assert.equal(classifyEvent("payment_intent.succeeded", { metadata: { auto: "1" } }), "paid_candidate");
  assert.equal(classifyEvent("payment_intent.succeeded", { metadata: {} }), "ignore");
  assert.equal(classifyEvent("payment_intent.succeeded", null), "ignore");
  assert.equal(classifyEvent("payment_intent.payment_failed", { metadata: { auto: "1" } }), "ignore");
  assert.equal(classifyEvent("checkout.session.completed"), "paid_candidate");
});

test("adaptador Stripe: cobrança automática com chave, 402 vira recusa, requires_action é cancelada; consulta de pi_ lê o pagamento", async () => {
  const reqs = [];
  const responses = [
    { status: 402, body: { error: { type: "card_error", code: "card_declined", decline_code: "generic_decline", payment_intent: { id: "pi_x" } } } },
    { status: 200, body: { id: "pi_y", status: "requires_action" } },
    { status: 200, body: { id: "pi_y", status: "canceled" } },
    { status: 500, body: {} },
    { status: 200, body: { id: "pi_z", status: "succeeded", amount: 17990, currency: "brl", latest_charge: { balance_transaction: { fee: 740, fee_details: [{ type: "stripe_fee", amount: 740 }] } } } },
  ];
  const fetchImpl = async (url, o) => { reqs.push({ url, o }); const r = responses.shift(); return { ok: r.status < 400, status: r.status, json: async () => r.body }; };
  const a = createStripeAdapter({ secret: "sk_test_x", webhookSecret: "w", fetchImpl, log: silent });
  const args = { charge: { id: CH, house_id: HOUSE, kind: "plan", amount_cents: "17990" }, customer: "cus_1", method: "pm_1", attempt: 1, idempotencyKey: "k1" };
  assert.deepEqual(await a.chargeSaved(args), { outcome: "recusada", ref: "pi_x", code: "generic_decline" });
  assert.match(reqs[0].o.headers["Idempotency-Key"], /^k1:[0-9a-f]{8}$/);
  assert.match(reqs[0].o.body, /off_session=true/); assert.match(reqs[0].o.body, /confirm=true/); assert.match(reqs[0].o.body, /amount=17990/);
  assert.equal((await a.chargeSaved(args)).outcome, "exige_acao");
  assert.match(reqs[2].url, /payment_intents\/pi_y\/cancel/);
  assert.equal(await a.chargeSaved(args), null, "erro 500: não sabemos");
  const g = await a.getCheckout({ ref: "pi_z" });
  assert.deepEqual([g.paid, g.amountCents, g.currency, g.feeCents], [true, 17990, "brl", 740]);
  assert.match(reqs[4].url, /\/v1\/payment_intents\/pi_z/);
});

test("a chave da cobrança automática: mesmo pedido = mesma chave; pedido diferente (outro cartão ou valor) = chave nova", async () => {
  const keys = [];
  const fetchImpl = async (url, o) => { keys.push(o.headers["Idempotency-Key"]); return { ok: false, status: 500, json: async () => ({}) }; };
  const a = createStripeAdapter({ secret: "sk_test_x", webhookSecret: "w", fetchImpl, log: silent });
  const base = { charge: { id: CH, house_id: HOUSE, kind: "plan", amount_cents: "17990" }, customer: "cus_1", method: "pm_1", attempt: 1, idempotencyKey: "k1" };
  await a.chargeSaved(base); await a.chargeSaved(base);
  await a.chargeSaved({ ...base, method: "pm_2" });
  await a.chargeSaved({ ...base, charge: { ...base.charge, amount_cents: "100" } });
  assert.equal(keys[0], keys[1]);
  assert.equal(new Set(keys).size, 3);
  assert.equal(fingerprint("abc"), fingerprint("abc"));
});

test("autorização de cobrança automática: sem ela, não abre o cadastro do cartão nem liga a cobrança; desligar nunca exige", async () => {
  const t = setup(); t.setAuthorized(false);
  await assert.rejects(() => cardSetup({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://app" }), (e) => e.code === "authorization_required" && /autorização/.test(e.message));
  assert.equal(t.fake.calls.createCardSetup ?? 0, 0);
  t.setCard({ customer: "cus_A", method: "pm_A", auto_enabled: false });
  await assert.rejects(() => cardSetAuto({ registry: t.registry, store: t.store, userId: "u1", enabled: true }), (e) => e.code === "authorization_required");
  assert.deepEqual(await cardSetAuto({ registry: t.registry, store: t.store, userId: "u1", enabled: false }), { auto_enabled: false });
  t.setAuthorized(true);
  await cardSetup({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://app" });
  assert.deepEqual(await cardSetAuto({ registry: t.registry, store: t.store, userId: "u1", enabled: true }), { auto_enabled: true });
});
