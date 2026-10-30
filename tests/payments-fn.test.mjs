import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildCheckoutParams, formBody, verifyStripeSignature, accountState, classifyEvent, sessionExpiry } from "../supabase/functions/payments/logic.js";

test("formBody aninha objetos e listas no estilo do Stripe", () => {
  const s = decodeURIComponent(formBody({ a: { b: [{ c: 1 }, { c: 2 }] }, d: true, e: null }));
  assert.equal(s, "a[b][0][c]=1&a[b][1][c]=2&d=true");
});

test("checkout: cobrança direta com a comissão da plataforma", () => {
  const p = buildCheckoutParams({ payment: { id: "p1", gross_cents: 20000, fee_cents: 800, order_id: "o1" }, title: "Trabalho", appUrl: "https://x.app", clientEmail: "a@b.c", expiresAt: 1 });
  assert.equal(p.line_items[0].price_data.currency, "brl");
  assert.equal(p.line_items[0].price_data.unit_amount, 20000);
  assert.equal(p.payment_intent_data.application_fee_amount, 800);
  assert.equal(p.payment_intent_data.metadata.payment_id, "p1");
  assert.equal(p.metadata.kind, "servico");
  assert.match(p.success_url, /pagamento\/retorno\?p=p1&s=ok$/);
  assert.equal(p.customer_email, "a@b.c");
});

test("checkout: mensalidade de membro leva a comissão de 4% e volta para as mensalidades", () => {
  const p = buildCheckoutParams({ payment: { id: "p9", gross_cents: 10000, fee_cents: 400, member_due_id: "d1" }, title: "Mensalidade 11/2026", appUrl: "https://x.app", expiresAt: 1 });
  assert.equal(p.metadata.kind, "mensalidade");
  assert.equal(p.payment_intent_data.application_fee_amount, 400);
  assert.match(p.success_url, /pagamento\/retorno\?p=p9&s=ok&k=m$/);
  assert.match(p.cancel_url, /&s=cancel&k=m$/);
});

test("checkout: recusa valor ou comissão fora do normal", () => {
  assert.throws(() => buildCheckoutParams({ payment: { id: "p", gross_cents: 50, fee_cents: 0 }, title: "x", appUrl: "u", expiresAt: 1 }));
  assert.throws(() => buildCheckoutParams({ payment: { id: "p", gross_cents: 1000, fee_cents: 2000 }, title: "x", appUrl: "u", expiresAt: 1 }));
  const p = buildCheckoutParams({ payment: { id: "p", gross_cents: 1000, fee_cents: 0, reservation_id: "r" }, title: "x", appUrl: "u", expiresAt: 1 });
  assert.equal("application_fee_amount" in p.payment_intent_data, false);
  assert.equal(p.metadata.kind, "ritual");
});

test("assinatura do aviso: válida, adulterada, antiga e sem segredo", async () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000_000;
  const t = Math.floor(now / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now), true);
  assert.equal(await verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret, now), false);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now + 400_000), false);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "", now), false);
  assert.equal(await verifyStripeSignature(body, "lixo", secret, now), false);
});

test("estado da conta e classificação dos avisos", () => {
  assert.deepEqual(accountState({ configuration: { merchant: { capabilities: { card_payments: { status: "active" }, stripe_balance: { payouts: { status: "active" } } } } }, requirements: { entries: [] } }),
    { charges_enabled: true, payouts_enabled: true, requirements_due: false });
  assert.equal(accountState({}).charges_enabled, false);
  assert.equal(classifyEvent("checkout.session.async_payment_succeeded"), "paid_candidate");
  assert.equal(classifyEvent("checkout.session.expired"), "failed");
  assert.equal(classifyEvent("charge.refunded"), "refunded");
  assert.equal(classifyEvent("customer.created"), "ignore");
  assert.ok(sessionExpiry(0) >= 30 * 60);
});
