// Chave do cartão do pagador (0200): é só um sinal. Grava quando o pagamento em cartão é confirmado e quando o cartão é salvo,
// e NUNCA atrapalha o pagamento nem a baixa da fatura, mesmo se a gravação falhar.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardSync, openPayment, rememberPayerKey, settleRef } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";
import { cardFingerprint, createStripeAdapter } from "../supabase/functions/platform-billing/stripeAdapter.js";

const silent = { error() {}, log() {} };
const FP = "AbCdEf1234567890";

function setup({ keyFails = false } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const charge = { id: "c1", house_id: "h1", kind: "plan", amount_cents: "10000", description: "Mensalidade", status: "aberta", provider: null, provider_ref: null, provider_method: null };
  const refs = new Map(); const keys = []; const saved = [];
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" }, methods: { plan: ["card"] } }),
    chargeById: async () => charge,
    houseOwner: async () => "u1",
    houseOfOwner: async () => "h1",
    refCount: async () => refs.size,
    payable: async () => 10000,
    attach: async (_id, prov, ref, method, url, amount) => { refs.set(ref, amount); charge.provider = prov; charge.provider_ref = ref; },
    chargeIdByRef: async (_p, ref) => (refs.has(ref) ? "c1" : null),
    expected: async (_p, ref) => refs.get(ref) ?? 10000,
    confirm: async () => { charge.status = "paga"; return { duplicate: false }; },
    progress: async () => {},
    payerKey: async (user, fp) => { if (keyFails) throw new Error("banco fora do ar"); keys.push([user, fp]); return true; },
    cardSave: async (h, p, ref, cust, m) => { saved.push([h, m.id]); return { already: false, previous_method: null }; },
  };
  return { fake, registry, store, charge, refs, keys, saved };
}
const base = (t) => ({ registry: t.registry, store: t.store, chargeId: "c1", userId: "u1", email: "a@b.c", appUrl: "https://app.example", nowMs: 1_800_000_000_000 });

test("pagamento em cartão confirmado: grava a impressão ligada à dona da casa", async () => {
  const t = setup();
  await openPayment({ ...base(t), method: "card" });
  const ref = [...t.refs.keys()][0];
  t.fake.markPaid(ref, { feeCents: 400, payerKey: FP });
  const r = await settleRef({ store: t.store, adapter: t.fake, ref, log: silent });
  assert.equal(r.outcome, "paid");
  assert.deepEqual(t.keys, [["u1", FP]]);
});

test("pagamento sem impressão (Pix e outros): nada é gravado e a fatura é baixada do mesmo jeito", async () => {
  const t = setup();
  await openPayment({ ...base(t), method: "card" });
  const ref = [...t.refs.keys()][0];
  t.fake.markPaid(ref, { feeCents: 400 });
  const r = await settleRef({ store: t.store, adapter: t.fake, ref, log: silent });
  assert.equal(r.outcome, "paid");
  assert.equal(t.charge.status, "paga");
  assert.deepEqual(t.keys, []);
});

test("se gravar a chave falhar, o pagamento continua confirmado (a chave é só um sinal)", async () => {
  const t = setup({ keyFails: true });
  await openPayment({ ...base(t), method: "card" });
  const ref = [...t.refs.keys()][0];
  t.fake.markPaid(ref, { feeCents: 400, payerKey: FP });
  const logged = [];
  const r = await settleRef({ store: t.store, adapter: t.fake, ref, log: { error: (...a) => logged.push(a), log() {} } });
  assert.equal(r.outcome, "paid");
  assert.equal(t.charge.status, "paga");
  assert.equal(logged.length, 1);
  assert.doesNotMatch(JSON.stringify(logged), new RegExp(FP));
});

test("conferir o mesmo pagamento duas vezes não duplica nada (o banco só renova a guarda)", async () => {
  const t = setup();
  await openPayment({ ...base(t), method: "card" });
  const ref = [...t.refs.keys()][0];
  t.fake.markPaid(ref, { feeCents: 400, payerKey: FP });
  await settleRef({ store: t.store, adapter: t.fake, ref, log: silent });
  await settleRef({ store: t.store, adapter: t.fake, ref, log: silent });
  assert.deepEqual(t.keys, [["u1", FP], ["u1", FP]]);
});

test("cartão salvo para cobrança automática também grava a impressão", async () => {
  const t = setup();
  const reg = t.registry;
  // sessão de cadastro do cartão direto no provedor de teste
  const setupRes = await t.fake.createCardSetup({ customer: "cus_1", houseId: "h1", appUrl: "https://app.example", expiresAtSec: 2_000_000_000 });
  t.fake.completeSetup(setupRes.ref, { id: "pm_1", brand: "visa", last4: "4242", expMonth: 12, expYear: 2031, fingerprint: FP });
  await cardSync({ registry: reg, store: t.store, userId: "u1", sessionRef: setupRes.ref, log: silent });
  assert.deepEqual(t.keys, [["u1", FP]]);
  assert.deepEqual(t.saved, [["h1", "pm_1"]]);
});

test("rememberPayerKey: sem impressão, sem casa ou sem dona não grava nada e nunca lança erro", async () => {
  const keys = [];
  const store = { houseOwner: async (h) => (h === "ok" ? "u9" : null), payerKey: async (u, f) => { keys.push([u, f]); return true; } };
  assert.equal(await rememberPayerKey({ store, houseId: "ok", fingerprint: null, log: silent }), false);
  assert.equal(await rememberPayerKey({ store, houseId: null, fingerprint: FP, log: silent }), false);
  assert.equal(await rememberPayerKey({ store, houseId: "sem-dona", fingerprint: FP, log: silent }), false);
  assert.equal(await rememberPayerKey({ store, houseId: "ok", fingerprint: FP, log: silent }), true);
  assert.deepEqual(keys, [["u9", FP]]);
});

function fetchMock(responses) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); const r = responses.shift(); return { ok: r.status < 400, status: r.status, json: async () => r.body }; };
  return { fn, calls };
}

test("Stripe: lê a impressão só do pagamento em cartão já pago, e ignora valores estranhos", async () => {
  assert.equal(cardFingerprint({ payment_method_details: { card: { fingerprint: FP } } }), FP);
  assert.equal(cardFingerprint({ payment_method_details: { pix: {} } }), null);
  assert.equal(cardFingerprint({ payment_method_details: { card: { fingerprint: "x y; drop table" } } }), null);
  assert.equal(cardFingerprint(null), null);
  const charge = (extra = {}) => ({ balance_transaction: { fee: 175, fee_details: [{ type: "stripe_fee", amount: 175 }] }, payment_method_details: { card: { fingerprint: FP } }, ...extra });
  const f = fetchMock([
    { status: 200, body: { id: "cs_p", status: "complete", payment_status: "paid", amount_total: 8990, currency: "brl", payment_intent: { latest_charge: charge() } } },
    { status: 200, body: { id: "cs_u", status: "complete", payment_status: "unpaid", amount_total: 8990, currency: "brl", payment_intent: { latest_charge: charge() } } },
    { status: 200, body: { id: "pi_1", status: "succeeded", amount: 8990, currency: "brl", latest_charge: charge() } },
  ]);
  const a = createStripeAdapter({ secret: "s", webhookSecret: "w", fetchImpl: f.fn, log: silent });
  assert.equal((await a.getCheckout({ ref: "cs_p" })).payerKey, FP);
  assert.equal((await a.getCheckout({ ref: "cs_u" })).payerKey, null);
  assert.equal((await a.getCheckout({ ref: "pi_1" })).payerKey, FP);
});

test("Stripe: o cadastro do cartão devolve a impressão do cartão", async () => {
  const f = fetchMock([{ status: 200, body: { id: "cs_s", mode: "setup", status: "complete", customer: "cus_1", metadata: { house_id: "h1" },
    setup_intent: { status: "succeeded", payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2031, fingerprint: FP } } } } }]);
  const a = createStripeAdapter({ secret: "s", webhookSecret: "w", fetchImpl: f.fn, log: silent });
  const s = await a.getCardSetup({ ref: "cs_s" });
  assert.equal(s.method.fingerprint, FP);
  assert.equal(s.method.last4, "4242");
});

test("0200: a impressão fica só como hash, sem chave estrangeira, só o servidor grava e o painel nunca a mostra", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0200_chave_do_cartao_do_pagador.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.match(sql, /extensions\.digest\(p_fingerprint \|\| ':' \|\| v_salt, 'sha256'\)/);
  assert.doesNotMatch(sql, /references /i);
  assert.match(sql, /grant execute on function public\.payer_key_record\(uuid, text\) to service_role/);
  assert.match(sql, /revoke all on table public\.payer_card_keys from public, anon, authenticated/);
  assert.match(sql, /retain_until timestamptz not null default now\(\) \+ interval '24 months'/);
  assert.match(sql, /cron\.schedule\('payer-keys-purge'/);
  const painel = sql.split("select s.me")[1].split("from sides s")[0];
  assert.doesNotMatch(painel, /key_hash|fingerprint|payer_card_keys/);
  assert.match(sql, /pr\.sinais && array\['aparelho','documento','cartao'\]/);
});

test("0200: o reembolso de 7 dias continua negado SÓ quando a outra conta ligada já usou o reembolso (nada é barrado antes)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0200_chave_do_cartao_do_pagador.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  const regra = sql.split("function public.house_owner_refund_used_before")[1].split("$$;")[0];
  assert.match(regra, /account_card_others\(h\.owner_id\)/);
  assert.match(regra, /account_linked_others\(h\.owner_id\)/);
  assert.match(regra, /account_prior_deleted\(h\.owner_id\)/);
  assert.match(regra, /r\.status in \('pendente', 'concluido'\)/);
  // nenhuma regra de cadastro ou de contratação foi tocada
  assert.doesNotMatch(sql, /platform_subscribe_issue|handle_new_user|raise exception 'Conta reutilizada/);
});
