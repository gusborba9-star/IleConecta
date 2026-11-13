// Cobrança da Plataforma (platform-billing): regras puras, adaptador do Stripe (rede simulada), contrato do provedor e independência do Marketplace.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { buildCheckoutParams, checkoutExpiry, classifyEvent, feeFromBalanceTransaction, formBody, stripeMethodTypes, verifyStripeSignature } from "../supabase/functions/platform-billing/logic.js";
import { createStripeAdapter } from "../supabase/functions/platform-billing/stripeAdapter.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { ProviderError, assertProvider, createRegistry } from "../supabase/functions/platform-billing/provider.js";

const charge = { id: "11111111-1111-1111-1111-111111111111", house_id: "22222222-2222-2222-2222-222222222222", kind: "plan", amount_cents: "8990", description: "Mensalidade do plano" };

test("meios do painel viram tipos do Stripe, sem repetir; desconhecidos são ignorados", () => {
  assert.deepEqual(stripeMethodTypes(["card", "card_recurring", "pix"]), ["card", "pix"]);
  assert.deepEqual(stripeMethodTypes(["pix"]), ["pix"]);
  assert.deepEqual(stripeMethodTypes(["boleto"]), []);
  assert.deepEqual(stripeMethodTypes(undefined), []);
});

test("pedido da página de pagamento: valor e moeda vêm da fatura; Pix com validade; cartão recorrente guarda o cartão", () => {
  const exp = checkoutExpiry(Date.now());
  const p = buildCheckoutParams({ charge, methods: ["card", "pix"], appUrl: "https://app.example", email: "a@b.c", expiresAtSec: exp });
  assert.equal(p.mode, "payment");
  assert.equal(p.line_items[0].price_data.currency, "brl");
  assert.equal(p.line_items[0].price_data.unit_amount, 8990);
  assert.equal(p.client_reference_id, charge.id);
  assert.equal(p.metadata.charge_id, charge.id);
  assert.deepEqual(p.payment_method_types, ["card", "pix"]);
  assert.ok(p.payment_method_options.pix.expires_after_seconds >= 60 && p.payment_method_options.pix.expires_after_seconds <= 86400);
  assert.equal(p.payment_intent_data.setup_future_usage, undefined);
  assert.equal(p.customer_email, "a@b.c");
  const rec = buildCheckoutParams({ charge, methods: ["card_recurring"], appUrl: "https://app.example", expiresAtSec: exp });
  assert.deepEqual(rec.payment_method_types, ["card"]);
  assert.equal(rec.payment_intent_data.setup_future_usage, "off_session");
  assert.equal(rec.payment_method_options, undefined);
  assert.equal(rec.customer_email, undefined);
  assert.throws(() => buildCheckoutParams({ charge, methods: [], appUrl: "x", expiresAtSec: exp }));
});

test("o corpo do pedido codifica aninhados e listas", () => {
  const b = formBody({ a: { b: 1 }, l: ["x", "y"], m: [{ q: 2 }], n: null });
  assert.ok(b.includes("a%5Bb%5D=1") && b.includes("l%5B0%5D=x") && b.includes("l%5B1%5D=y") && b.includes("m%5B0%5D%5Bq%5D=2"));
  assert.ok(!b.includes("n="));
});

test("tarifa desconhecida é nula, nunca zero", () => {
  assert.equal(feeFromBalanceTransaction(null), null);
  assert.equal(feeFromBalanceTransaction("txn_123"), null);
  assert.equal(feeFromBalanceTransaction({}), null);
  assert.equal(feeFromBalanceTransaction({ fee_details: [] }), null);
  assert.equal(feeFromBalanceTransaction({ fee: 150, fee_details: [{ type: "stripe_fee", amount: 100 }] }), null);
  assert.equal(feeFromBalanceTransaction({ fee_details: [{ type: "stripe_fee", amount: "x" }] }), null);
  assert.equal(feeFromBalanceTransaction({ fee: 150, fee_details: [{ type: "stripe_fee", amount: 150 }] }), 150);
  assert.equal(feeFromBalanceTransaction({ fee: 0, fee_details: [] }), 0);
  assert.equal(feeFromBalanceTransaction({ fee_details: [{ type: "stripe_fee", amount: 0 }] }), 0);
});

test("assinatura do aviso: válida, adulterada, expirada, sem segredo", async () => {
  const body = '{"id":"evt_1"}', secret = "whsec_test", t = Math.floor(Date.now() / 1000);
  const sig = (ts, b = body) => `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${b}`).digest("hex")}`;
  assert.equal(await verifyStripeSignature(body, sig(t), secret), true);
  assert.equal(await verifyStripeSignature(body + " ", sig(t), secret), false);
  assert.equal(await verifyStripeSignature(body, sig(t - 4000), secret), false);
  assert.equal(await verifyStripeSignature(body, sig(t), ""), false);
  assert.equal(await verifyStripeSignature(body, null, secret), false);
  assert.equal(await verifyStripeSignature(body, "t=1,v1=abc", secret), false);
});

test("avisos: só os de pagamento e de falha da sessão importam", () => {
  assert.equal(classifyEvent("checkout.session.completed"), "paid_candidate");
  assert.equal(classifyEvent("checkout.session.async_payment_succeeded"), "paid_candidate");
  assert.equal(classifyEvent("checkout.session.async_payment_failed"), "failed");
  assert.equal(classifyEvent("checkout.session.expired"), "failed");
  assert.equal(classifyEvent("charge.refunded"), "ignore");
});

function fetchMock(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return { fn, calls };
}

test("Stripe: cria a sessão na conta DA PLATAFORMA (sem Stripe-Account), com idempotência e versão da API", async () => {
  const { fn, calls } = fetchMock([{ status: 200, body: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" } }]);
  const a = createStripeAdapter({ secret: "sk_test_x", webhookSecret: "w", fetchImpl: fn, log: { error() {} } });
  const r = await a.createCheckout({ charge, methods: ["pix"], appUrl: "https://app.example", email: "a@b.c", expiresAtSec: checkoutExpiry(), idempotencyKey: "pb:1:0:pix" });
  assert.deepEqual(r, { ref: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", method: "pix" });
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].init.headers["Stripe-Account"], undefined);
  assert.equal(calls[0].init.headers["Idempotency-Key"], "pb:1:0:pix");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_x");
  assert.ok(calls[0].init.headers["Stripe-Version"]);
  assert.ok(String(calls[0].init.body).includes("unit_amount%5D=8990") || String(calls[0].init.body).includes("unit_amount%5D=8990".replace("%5D", "%5D")));
});

test("Stripe: erro do provedor vira ProviderError sem vazar a chave; resposta sem URL também", async () => {
  const f1 = fetchMock([{ status: 402, body: { error: { message: "Seu cartão foi recusado." } } }]);
  const a = createStripeAdapter({ secret: "sk_live_segredo", webhookSecret: "w", fetchImpl: f1.fn, log: { error() {} } });
  await assert.rejects(() => a.createCheckout({ charge, methods: ["card"], appUrl: "https://a", expiresAtSec: checkoutExpiry(), idempotencyKey: "k" }), (e) => e instanceof ProviderError && !/sk_live/.test(e.message));
  const f2 = fetchMock([{ status: 200, body: { id: "cs_2" } }]);
  const b = createStripeAdapter({ secret: "s", webhookSecret: "w", fetchImpl: f2.fn, log: { error() {} } });
  await assert.rejects(() => b.createCheckout({ charge, methods: ["card"], appUrl: "https://a", expiresAtSec: checkoutExpiry(), idempotencyKey: "k" }), ProviderError);
});

test("Stripe: estado da sessão — pago com tarifa, pendente (Pix), expirado, tarifa ainda desconhecida", async () => {
  const bt = { fee: 175, fee_details: [{ type: "stripe_fee", amount: 175 }] };
  const f = fetchMock([
    { status: 200, body: { id: "cs_p", status: "complete", payment_status: "paid", amount_total: 8990, currency: "BRL", payment_intent: { latest_charge: { balance_transaction: bt } } } },
    { status: 200, body: { id: "cs_q", status: "complete", payment_status: "unpaid", amount_total: 8990, currency: "brl", payment_intent: { latest_charge: null } } },
    { status: 200, body: { id: "cs_e", status: "expired", payment_status: "unpaid", amount_total: 8990, currency: "brl", payment_intent: null } },
    { status: 200, body: { id: "cs_n", status: "complete", payment_status: "paid", amount_total: 8990, currency: "brl", payment_intent: { latest_charge: { balance_transaction: "txn_1" } } } },
  ]);
  const a = createStripeAdapter({ secret: "s", webhookSecret: "w", fetchImpl: f.fn, log: { error() {} } });
  const paid = await a.getCheckout({ ref: "cs_p" });
  assert.deepEqual([paid.paid, paid.pending, paid.status, paid.amountCents, paid.currency, paid.feeCents], [true, false, "complete", 8990, "brl", 175]);
  const pend = await a.getCheckout({ ref: "cs_q" });
  assert.deepEqual([pend.paid, pend.pending, pend.feeCents], [false, true, null]);
  assert.equal((await a.getCheckout({ ref: "cs_e" })).status, "expired");
  assert.equal((await a.getCheckout({ ref: "cs_n" })).feeCents, null);
  assert.ok(f.calls[0].url.includes("expand%5B0%5D=payment_intent.latest_charge.balance_transaction") || f.calls[0].url.includes("expand[0]=payment_intent.latest_charge.balance_transaction"));
});

test("Stripe: o aviso vira forma neutra; só o id da sessão é usado", () => {
  const a = createStripeAdapter({ secret: "s", webhookSecret: "w", fetchImpl: async () => ({}), log: { error() {} } });
  assert.deepEqual(a.parseEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_9", payment_status: "paid", amount_total: 1 } } }), { id: "evt_1", type: "checkout.session.completed", kind: "paid_candidate", ref: "cs_9" });
  assert.equal(a.parseEvent({ id: "evt_2", type: "customer.created", data: { object: { id: "cus_1" } } }).kind, "ignore");
});

test("contrato: o Stripe e o provedor de teste cumprem; adaptador incompleto é recusado; registro não aceita repetido", () => {
  const stripe = createStripeAdapter({ secret: "s", webhookSecret: "w", fetchImpl: async () => ({}) });
  assert.equal(assertProvider(stripe), stripe);
  assert.equal(assertProvider(createFakeProvider()).id, "fake");
  assert.throws(() => assertProvider({ id: "x" }), ProviderError);
  assert.throws(() => assertProvider({ id: "Inválido!", createCheckout() {}, getCheckout() {}, verifyWebhook() {}, parseEvent() {} }), ProviderError);
  const reg = createRegistry([stripe, createFakeProvider()]);
  assert.equal(reg.byId("stripe"), stripe);
  assert.equal(reg.byId("efi"), null);
  assert.throws(() => createRegistry([stripe, stripe]), ProviderError);
});

test("independência: platform-billing não importa nada do Marketplace e usa segredos próprios", () => {
  const dir = new URL("../supabase/functions/platform-billing/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.ok(!/from\s+["'][^"']*payments[^"']*["']/.test(src), `${f} importa o Marketplace`);
  }
  const idx = readFileSync(new URL("index.ts", dir), "utf8");
  assert.ok(idx.includes("PLATFORM_STRIPE_SECRET_KEY") && idx.includes("PLATFORM_STRIPE_WEBHOOK_SECRET"));
  assert.ok(!/Deno\.env\.get\("STRIPE_SECRET_KEY"\)/.test(idx) && !/Deno\.env\.get\("STRIPE_WEBHOOK_SECRET"\)/.test(idx));
  assert.ok(idx.includes("billing_config") || readFileSync(new URL("core.js", dir), "utf8").includes("cfg?.enabled"));
});

test("nenhum segredo no código da função nem no cartão do painel", () => {
  const dir = new URL("../supabase/functions/platform-billing/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.ok(!/sk_(live|test)_[A-Za-z0-9]{8,}/.test(src) && !/whsec_[A-Za-z0-9]{8,}/.test(src), `${f} tem segredo`);
  }
});

import { CREDIT_PACKS, creditPurchaseError } from "../supabase/functions/platform-billing/logic.js";

test("compra de créditos: só frases conhecidas chegam à casa; o resto vira mensagem genérica", () => {
  assert.deepEqual(CREDIT_PACKS, ["p80", "p200", "p500"]);
  assert.match(creditPurchaseError("cobranca_desligada"), /ainda não está disponível/);
  assert.match(creditPurchaseError("Regularize a fatura em atraso para comprar créditos."), /Regularize/);
  assert.match(creditPurchaseError("O plano da casa não inclui a assistente."), /não inclui a assistente/);
  const leak = creditPurchaseError('duplicate key value violates unique constraint "x" at db.internal:5432');
  assert.match(leak, /Tente de novo/);
  assert.doesNotMatch(leak, /duplicate|constraint|5432/);
  assert.match(creditPurchaseError(undefined), /Tente de novo/);
});

test("abrir o pagamento de novo em outro segundo, sem página gravada, não bate na chave de idempotência do Stripe", async () => {
  const { openPayment } = await import("../supabase/functions/platform-billing/core.js");
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const c = { ...charge, status: "aberta", provider: null, provider_ref: null, provider_method: null };
  let attached = 0;
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" }, methods: { plan: ["pix", "card"] } }),
    chargeById: async () => c,
    houseOwner: async () => "u1",
    refCount: async () => 0,
    attach: async () => { attached++; if (attached === 1) throw new Error("falha ao gravar"); },
  };
  const base = { registry, store, chargeId: c.id, userId: "u1", method: "card", email: "a@b.c", appUrl: "https://app.example" };
  // 1ª tentativa: o provedor cria a página, mas a gravação no banco falha (a chave "pb:…:0:card" fica usada no provedor)
  await assert.rejects(() => openPayment({ ...base, nowMs: 1_800_000_000_000 }), /Tente de novo/);
  // 2ª tentativa, segundos depois, mesmo estado (nenhuma referência gravada): precisa funcionar
  const r = await openPayment({ ...base, nowMs: 1_800_000_007_000 });
  assert.match(r.url, /^https:\/\/pay\.example\//);
  // clique repetido no mesmo instante continua idempotente (mesma página, sem criar outra)
  const before = fake.sessions.size;
  await openPayment({ ...base, nowMs: 1_800_000_007_000 });
  assert.equal(fake.sessions.size, before);
});
