// EXEC-01 — contrato do provedor, registro e adaptador do Stripe (com fetch falso: nenhuma chamada real).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DivergenceError, PROVIDER_METHODS, ProviderError, assertProvider, assertSameTransaction, createRegistry,
} from "../supabase/functions/payments/provider.js";
import { createStripeAdapter } from "../supabase/functions/payments/stripeAdapter.js";
import { signStripePayload } from "./helpers/stripeSign.mjs";

const quiet = { error() {} };
const fakeAdapter = (id) => Object.fromEntries([["id", id], ...PROVIDER_METHODS.map((m) => [m, async () => ({})])]);

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname}`;
    calls.push({ key, url: String(url), headers: init.headers, body: init.body });
    const h = routes[key] ?? routes[`${init.method} *`];
    if (!h) return { ok: false, status: 404, json: async () => ({ error: { message: `sem rota ${key}` } }) };
    const out = typeof h === "function" ? h(init, u) : h;
    return { ok: out.ok !== false, status: out.status ?? 200, json: async () => out.body ?? out };
  };
  f.calls = calls;
  return f;
}
const adapterWith = (routes) => {
  const fetchImpl = fakeFetch(routes);
  return { a: createStripeAdapter({ secret: "sk_test", webhookSecret: "whsec", fetchImpl, log: quiet }), fetchImpl };
};

test("contrato: adaptador do Stripe implementa todos os métodos", () => {
  const { a } = adapterWith({});
  assert.equal(assertProvider(a).id, "stripe");
  for (const m of PROVIDER_METHODS) assert.equal(typeof a[m], "function", m);
});

test("contrato: adaptador incompleto é recusado", () => {
  assert.throws(() => assertProvider({ id: "x" }), ProviderError);
  assert.throws(() => assertProvider(null), ProviderError);
});

test("registro: provedor da transação, sem troca silenciosa", () => {
  const reg = createRegistry([fakeAdapter("stripe"), fakeAdapter("outro")], ["stripe"]);
  assert.equal(reg.forPayment({ provider: "outro" }).id, "outro");
  assert.equal(reg.forPayment({ provider: "stripe" }).id, "stripe");
  assert.throws(() => reg.forPayment({}), /sem provedor/);
  assert.throws(() => reg.forPayment({ provider: "inexistente" }), /não disponível/);
  assert.equal(reg.forNew("stripe").id, "stripe");
  assert.throws(() => reg.forNew("outro"), /não está ativo/);
  assert.throws(() => createRegistry([fakeAdapter("stripe")], ["efi"]), /não está registrado/);
  assert.throws(() => createRegistry([fakeAdapter("stripe"), fakeAdapter("stripe")], ["stripe"]), /duas vezes/);
});

test("identidade: provedor, referência e conta precisam bater", () => {
  const pay = { provider: "stripe", provider_ref: "cs_1", stripe_account_id: "acct_1" };
  assert.doesNotThrow(() => assertSameTransaction(pay, { provider: "stripe", ref: "cs_1", account: "acct_1" }));
  assert.throws(() => assertSameTransaction(pay, { provider: "outro", ref: "cs_1", account: "acct_1" }), DivergenceError);
  assert.throws(() => assertSameTransaction(pay, { provider: "stripe", ref: "cs_2", account: "acct_1" }), DivergenceError);
  assert.throws(() => assertSameTransaction(pay, { provider: "stripe", ref: "cs_1", account: "acct_2" }), DivergenceError);
  assert.throws(() => assertSameTransaction(pay, { provider: "stripe", ref: "cs_1", account: null }), DivergenceError);
  assert.throws(() => assertSameTransaction(null, { provider: "stripe" }), DivergenceError);
  // sem conta registrada, não exige conta
  assert.doesNotThrow(() => assertSameTransaction({ provider: "stripe", provider_ref: "cs_1" }, { provider: "stripe", ref: "cs_1", account: null }));
});

test("isolamento: só o adaptador fala com o Stripe", () => {
  const read = (f) => readFileSync(new URL(`../supabase/functions/payments/${f}`, import.meta.url), "utf8");
  for (const f of ["index.ts", "core.js", "store.js", "provider.js"]) {
    const src = read(f);
    assert.ok(!/api\.stripe\.com|Stripe-Account|Stripe-Version|\/v1\/|\/v2\/core|Idempotency-Key/.test(src), `${f} fala direto com o Stripe`);
  }
  assert.ok(/api\.stripe\.com/.test(read("stripeAdapter.js")));
});

test("adaptador: checkout na conta da casa com chave de idempotência", async () => {
  const { a, fetchImpl } = adapterWith({ "POST /v1/checkout/sessions": { body: { id: "cs_new", url: "https://pay/x" } } });
  const r = await a.createCheckout({
    payment: { id: "p1", gross_cents: 10000, fee_cents: 1500, stage_no: null }, title: "Ritual", appUrl: "https://app", clientEmail: "a@b.c",
    account: "acct_1", expiresAt: 1999999999, idempotencyKey: "cs_p1_0",
  });
  assert.deepEqual(r, { ref: "cs_new", url: "https://pay/x" });
  const c = fetchImpl.calls[0];
  assert.equal(c.headers["Stripe-Account"], "acct_1");
  assert.equal(c.headers["Idempotency-Key"], "cs_p1_0");
  assert.match(c.body, /application_fee_amount/);
});

test("adaptador: reembolso reaproveita devolução existente (sem duplicar)", async () => {
  let created = 0;
  const { a } = adapterWith({
    "GET /v1/checkout/sessions/cs_1": { body: { id: "cs_1", payment_intent: "pi_1" } },
    "GET /v1/refunds": { body: { data: [{ id: "re_old", status: "succeeded" }] } },
    "POST /v1/refunds": () => { created++; return { body: { id: "re_new", status: "succeeded" } }; },
  });
  const r = await a.refund({ ref: "cs_1", account: "acct_1", correlation: { payment_id: "p1" }, idempotencyKey: "k" });
  assert.deepEqual(r, { refundRef: "re_old", status: "succeeded", reused: true });
  assert.equal(created, 0);
});

test("adaptador: reembolso ignora devolução falha/cancelada e cria com correlação", async () => {
  let sent;
  const { a, fetchImpl } = adapterWith({
    "GET /v1/checkout/sessions/cs_1": { body: { id: "cs_1", payment_intent: "pi_1" } },
    "GET /v1/refunds": { body: { data: [{ id: "re_f", status: "failed" }, { id: "re_c", status: "canceled" }] } },
    "POST /v1/refunds": (init) => { sent = init.body; return { body: { id: "re_new", status: "pending" } }; },
  });
  const r = await a.refund({ ref: "cs_1", account: "acct_1", correlation: { payment_id: "p1", refund_request_id: "rr1", x: undefined }, idempotencyKey: "refund_rr1" });
  assert.equal(r.refundRef, "re_new");
  assert.equal(r.reused, false);
  assert.match(sent, /refund_application_fee=true/);
  assert.match(sent, /metadata%5Bpayment_id%5D=p1/);
  assert.match(sent, /metadata%5Brefund_request_id%5D=rr1/);
  assert.ok(!/metadata%5Bx%5D/.test(sent));
  assert.equal(fetchImpl.calls.at(-1).headers["Idempotency-Key"], "refund_rr1");
});

test("adaptador: reembolso de pagamento não concluído falha com código", async () => {
  const { a } = adapterWith({ "GET /v1/checkout/sessions/cs_1": { body: { id: "cs_1", payment_intent: null } } });
  await assert.rejects(a.refund({ ref: "cs_1", account: "acct_1" }), (e) => e instanceof ProviderError && e.code === "not_paid");
});

test("adaptador: tarifa e forma de pagamento", async () => {
  const { a } = adapterWith({
    "GET /v1/checkout/sessions/cs_1": { body: { id: "cs_1", payment_intent: "pi_1" } },
    "GET /v1/payment_intents/pi_1": { body: { latest_charge: { payment_method_details: { type: "pix" }, balance_transaction: { fee_details: [{ type: "stripe_fee", amount: 120 }, { type: "application_fee", amount: 1500 }, { type: "stripe_fee", amount: 30 }] } } } },
  });
  assert.deepEqual(await a.fetchFees({ ref: "cs_1", account: "acct_1" }), { feeCents: 150, method: "pix" });
});

test("adaptador: erro do Stripe vira ProviderError", async () => {
  const { a } = adapterWith({ "GET /v1/checkout/sessions/cs_x": { ok: false, status: 400, body: { error: { message: "No such session" } } } });
  await assert.rejects(a.getCheckout({ ref: "cs_x", account: "acct_1" }), (e) => e instanceof ProviderError && /No such session/.test(e.message));
});

test("adaptador: parseEvent neutro", () => {
  const { a } = adapterWith({});
  const paid = a.parseEvent({ id: "evt_1", type: "checkout.session.completed", account: "acct_1", data: { object: { id: "cs_1", payment_status: "paid", metadata: { payment_id: "p1" } } } });
  assert.deepEqual({ k: paid.kind, ref: paid.ref, paid: paid.paid, pid: paid.paymentId, acc: paid.account }, { k: "paid_candidate", ref: "cs_1", paid: true, pid: "p1", acc: "acct_1" });
  const wait = a.parseEvent({ id: "e", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "unpaid" } } });
  assert.equal(wait.paid, false);
  const full = a.parseEvent({ id: "e", type: "charge.refunded", data: { object: { amount: 100, amount_refunded: 100, metadata: { payment_id: "p1" } } } });
  assert.equal(full.fullyRefunded, true);
  const part = a.parseEvent({ id: "e", type: "charge.refunded", data: { object: { amount: 100, amount_refunded: 40, refunded: false, metadata: { payment_id: "p1" } } } });
  assert.equal(part.fullyRefunded, false);
  assert.equal(a.parseEvent({ id: "e", type: "outro.evento", data: {} }).kind, "ignore");
});

test("adaptador: assinatura do aviso", async () => {
  const { a } = adapterWith({});
  const raw = JSON.stringify({ id: "evt_1" });
  const good = await signStripePayload(raw, "whsec");
  assert.equal(await a.verifyWebhook(raw, { "stripe-signature": good }), true);
  assert.equal(await a.verifyWebhook(raw, new Headers({ "stripe-signature": good })), true);
  assert.equal(await a.verifyWebhook(raw, { "stripe-signature": "t=1,v1=00" }), false);
  assert.equal(await a.verifyWebhook(raw, {}), false);
});
