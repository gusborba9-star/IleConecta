// EXEC-01 — fluxos do núcleo financeiro com banco em memória (mesma trava/lease do SQL) e o adaptador real do Stripe com fetch falso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, DivergenceError } from "../supabase/functions/payments/provider.js";
import { createStripeAdapter } from "../supabase/functions/payments/stripeAdapter.js";
import * as core from "../supabase/functions/payments/core.js";
import { signStripePayload } from "./helpers/stripeSign.mjs";

const quiet = { error() {} };
const SECRET = "whsec_test";

// ---------- banco em memória (espelha acquire/finish/confirm_*/record_*_fee da migração 0064) ----------
function memStore(seed = []) {
  const s = {
    now: 1_000_000,
    payments: new Map(seed.map((p) => [p.id, { status: "pendente", provider: "stripe", stripe_account_id: "acct_1", processor_fee_cents: null, member_due_id: null, ...p }])),
    events: new Map(),
    refundRequests: new Map(), // id -> { id, payment_id, status }
    log: { confirm: 0, ledger: 0, fee: 0, completeRefund: 0, completeCancel: 0 },
    fail: {}, // { finishEvent: n, confirm: n, recordFee: n, completeRefund: n, attach: n } -> quantas próximas chamadas falham
  };
  const boom = (k) => { if (s.fail[k] > 0) { s.fail[k]--; throw new Error(`falha simulada: ${k}`); } };
  return Object.assign(s, {
    async acquireEvent({ id, type, account, payload }) {
      await Promise.resolve(); // dá chance a outro concorrente de chegar junto; a decisão abaixo é atômica (como o INSERT ... ON CONFLICT)
      const e = s.events.get(id);
      if (!e) { s.events.set(id, { id, type, account, payload, processed_at: null, locked_until: s.now + 120_000, attempts: 1, error: null }); return "acquired"; }
      if (e.processed_at) return "done";
      if (e.locked_until === null || e.locked_until < s.now) { e.locked_until = s.now + 120_000; e.attempts++; return "acquired"; }
      return "busy";
    },
    async finishEvent(id, outcome, error) {
      boom("finishEvent");
      const e = s.events.get(id);
      if (outcome === "done") Object.assign(e, { processed_at: s.now, error: null, locked_until: null });
      else if (outcome === "rejected") Object.assign(e, { processed_at: s.now, error: `rejeitado: ${error}`, locked_until: null });
      else Object.assign(e, { error, locked_until: null });
    },
    async paymentById(id) { return s.payments.get(id) ?? null; },
    async paymentByRef(provider, ref) { return [...s.payments.values()].find((p) => p.provider === provider && p.provider_ref === ref) ?? null; },
    async confirm(pay) {
      boom("confirm");
      const p = s.payments.get(pay.id);
      if (!p || p.provider !== pay.provider || p.provider_ref !== pay.provider_ref || (p.stripe_account_id && p.stripe_account_id !== pay.stripe_account_id)) throw new DivergenceError("banco: divergente");
      if (p.status === "confirmado") return "ja_confirmado";
      p.status = "confirmado"; s.log.confirm++; s.log.ledger += 3;
      return "confirmado";
    },
    async failPending(pay) { const p = s.payments.get(pay.id); if (p.status === "pendente" && p.provider === pay.provider) p.status = "falhou"; },
    async attachCheckout(pay, { provider, ref, account }) {
      boom("attach");
      const p = s.payments.get(pay.id);
      if (p.provider !== provider) throw new Error("provedor diferente");
      if (p.stripe_account_id && p.stripe_account_id !== account) throw new Error("gatilho: conta imutável");
      Object.assign(p, { provider_ref: ref, stripe_account_id: account });
    },
    async recordFee(pay, { feeCents }) {
      boom("recordFee");
      const p = s.payments.get(pay.id);
      if (p.processor_fee_cents !== null) return "ja_registrada";
      p.processor_fee_cents = feeCents; s.log.fee++;
      return "registrada";
    },
    async paymentsMissingFee(limit) {
      return [...s.payments.values()].filter((p) => p.status === "confirmado" && p.processor_fee_cents === null && p.provider === "stripe" && p.provider_ref && p.stripe_account_id).slice(0, limit);
    },
    async approvedRefundRequest(paymentId) { return [...s.refundRequests.values()].find((r) => r.payment_id === paymentId && r.status === "aprovado") ?? null; },
    async completeRefund(id) {
      boom("completeRefund");
      const r = s.refundRequests.get(id);
      if (r.status === "reembolsado") return;
      r.status = "reembolsado"; s.log.completeRefund++;
    },
    async completeCancelRefund(paymentId) { const p = s.payments.get(paymentId); if (p.status === "estornado") return; p.status = "estornado"; s.log.completeCancel++; },
    async confirmedPaymentsOf(kind, id) { const c = kind === "reserva" ? "reservation_id" : "order_id"; return [...s.payments.values()].filter((p) => p[c] === id && p.status === "confirmado"); },
    async pendingSources() { return s.sources ?? []; },
  });
}

// ---------- Stripe falso (fetch) ----------
function stripeFake(opts = {}) {
  const st = { refundsCreated: 0, refunds: [], calls: [], feeFail: false, ...opts };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname}`;
    st.calls.push(key);
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    const bad = (msg) => ({ ok: false, status: 400, json: async () => ({ error: { message: msg } }) });
    let m;
    if (key === "GET /v1/refunds") return ok({ data: st.refunds });
    if (key === "POST /v1/refunds") { st.refundsCreated++; const r = { id: `re_${st.refundsCreated}`, status: "succeeded" }; st.refunds.push(r); return ok(r); }
    if ((m = key.match(/^GET \/v1\/checkout\/sessions\/(.+)$/))) return ok({ id: m[1], status: st.sessionStatus ?? "open", url: "https://pay/open", payment_status: st.paid === false ? "unpaid" : "paid", payment_intent: "pi_1" });
    if (key === "POST /v1/checkout/sessions") return ok({ id: "cs_new", url: "https://pay/new" });
    if (key.startsWith("GET /v1/payment_intents/")) return st.feeFail ? bad("fee api down") : ok({ latest_charge: { payment_method_details: { type: "card" }, balance_transaction: { fee_details: [{ type: "stripe_fee", amount: 250 }] } } });
    return bad(`sem rota ${key}`);
  };
  return { st, adapter: createStripeAdapter({ secret: "sk", webhookSecret: SECRET, fetchImpl, log: quiet }) };
}

const PAY = { id: "p1", provider_ref: "cs_1", gross_cents: 10000, fee_cents: 1500, reservation_id: "r1" };
function setup(seed = [PAY], fakeOpts) {
  const store = memStore(seed);
  const fake = stripeFake(fakeOpts);
  const registry = createRegistry([fake.adapter], ["stripe"]);
  return { store, registry, fake };
}
async function deliver(ctx, event) {
  const raw = JSON.stringify(event);
  const headers = { "stripe-signature": await signStripePayload(raw, SECRET) };
  return core.processWebhook({ registry: ctx.registry, store: ctx.store, providerId: "stripe", rawBody: raw, headers, log: quiet });
}
const paidEvent = (over = {}) => ({ id: "evt_1", type: "checkout.session.completed", account: "acct_1", data: { object: { id: "cs_1", payment_status: "paid", metadata: { payment_id: "p1" } } }, ...over });

// ---------- avisos ----------
test("aviso pago: confirma uma vez, concilia a tarifa e fecha o evento", async () => {
  const c = setup();
  const r = await deliver(c, paidEvent());
  assert.equal(r.status, 200);
  assert.equal(c.store.payments.get("p1").status, "confirmado");
  assert.equal(c.store.payments.get("p1").processor_fee_cents, 250);
  assert.equal(c.store.events.get("evt_1").processed_at !== null, true);
});

test("assinatura inválida é recusada sem tocar no banco", async () => {
  const c = setup();
  const raw = JSON.stringify(paidEvent());
  const r = await core.processWebhook({ registry: c.registry, store: c.store, providerId: "stripe", rawBody: raw, headers: { "stripe-signature": "t=1,v1=aa" }, log: quiet });
  assert.equal(r.status, 400);
  assert.equal(c.store.events.size, 0);
});

test("aviso duplicado depois de concluído não confirma de novo", async () => {
  const c = setup();
  await deliver(c, paidEvent());
  const r2 = await deliver(c, paidEvent());
  assert.equal(r2.status, 200);
  assert.equal(r2.body.duplicate, true);
  assert.equal(c.store.log.confirm, 1);
  assert.equal(c.store.log.ledger, 3);
});

test("entregas simultâneas do mesmo aviso: só uma processa, a outra espera (409)", async () => {
  const c = setup();
  // barreira: os três chegam à trava ao mesmo tempo, antes de qualquer um terminar
  const orig = c.store.acquireEvent; let arrived = 0; let release; const gate = new Promise((r) => { release = r; });
  c.store.acquireEvent = async (e) => { if (++arrived === 3) release(); await gate; return orig(e); };
  const rs = await Promise.all([deliver(c, paidEvent()), deliver(c, paidEvent()), deliver(c, paidEvent())]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal(c.store.log.confirm, 1);
  assert.equal(c.store.events.get("evt_1").attempts, 1);
});

test("trava vencida: processo que caiu não bloqueia para sempre", async () => {
  const c = setup();
  // um processo adquiriu o evento e morreu sem fechar
  await c.store.acquireEvent({ id: "evt_1", type: "checkout.session.completed", account: "acct_1", payload: {} });
  assert.equal((await deliver(c, paidEvent())).status, 409); // ainda dentro da reserva
  c.store.now += 121_000; // reserva venceu
  const r = await deliver(c, paidEvent());
  assert.equal(r.status, 200);
  assert.equal(c.store.payments.get("p1").status, "confirmado");
  assert.equal(c.store.events.get("evt_1").attempts, 2);
});

test("falha ao confirmar: 500, evento liberado e a próxima entrega conclui", async () => {
  const c = setup();
  c.store.fail.confirm = 1;
  assert.equal((await deliver(c, paidEvent())).status, 500);
  assert.equal(c.store.events.get("evt_1").processed_at, null);
  assert.equal(c.store.events.get("evt_1").locked_until, null);
  assert.equal((await deliver(c, paidEvent())).status, 200);
  assert.equal(c.store.log.confirm, 1);
});

test("falha ao fechar o evento: 500, e a repetição não duplica o efeito financeiro", async () => {
  const c = setup();
  c.store.fail.finishEvent = 1;
  assert.equal((await deliver(c, paidEvent())).status, 500);
  assert.equal(c.store.payments.get("p1").status, "confirmado");
  c.store.now += 121_000;
  assert.equal((await deliver(c, paidEvent())).status, 200);
  assert.equal(c.store.log.confirm, 1);
  assert.equal(c.store.log.ledger, 3);
});

test("tarifa que falha não derruba a confirmação; a rotina concilia depois", async () => {
  const c = setup(undefined, { feeFail: true });
  const r = await deliver(c, paidEvent());
  assert.equal(r.status, 200);
  assert.equal(c.store.payments.get("p1").status, "confirmado");
  assert.equal(c.store.payments.get("p1").processor_fee_cents, null);
  c.fake.st.feeFail = false;
  assert.deepEqual(await core.reconcileFees({ registry: c.registry, store: c.store, log: quiet }), { fees_done: 1, fees_failed: 0 });
  assert.equal(c.store.payments.get("p1").processor_fee_cents, 250);
  assert.deepEqual(await core.reconcileFees({ registry: c.registry, store: c.store, log: quiet }), { fees_done: 0, fees_failed: 0 });
  assert.equal(c.store.log.fee, 1);
});

test("falha ao gravar a tarifa também não derruba a confirmação", async () => {
  const c = setup();
  c.store.fail.recordFee = 1;
  assert.equal((await deliver(c, paidEvent())).status, 200);
  assert.equal(c.store.payments.get("p1").status, "confirmado");
  assert.equal(c.store.payments.get("p1").processor_fee_cents, null);
});

test("Pix ainda aguardando: não confirma", async () => {
  const c = setup();
  const ev = paidEvent();
  ev.data.object.payment_status = "unpaid";
  assert.equal((await deliver(c, ev)).status, 200);
  assert.equal(c.store.payments.get("p1").status, "pendente");
});

// ---------- identificação da transação ----------
test("conta de origem diferente: rejeitado e nada é confirmado", async () => {
  const c = setup();
  const r = await deliver(c, paidEvent({ account: "acct_OUTRA" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.rejected, true);
  assert.equal(c.store.payments.get("p1").status, "pendente");
  assert.match(c.store.events.get("evt_1").error, /^rejeitado:/);
  assert.notEqual(c.store.events.get("evt_1").processed_at, null);
});

test("aviso sem conta para transação com conta registrada: rejeitado", async () => {
  const c = setup();
  const ev = paidEvent(); delete ev.account;
  assert.equal((await deliver(c, ev)).body.rejected, true);
  assert.equal(c.store.payments.get("p1").status, "pendente");
});

test("referência diferente da registrada (achada pelo id): rejeitado", async () => {
  const c = setup();
  const ev = paidEvent(); ev.data.object.id = "cs_OUTRA";
  assert.equal((await deliver(c, ev)).body.rejected, true);
  assert.equal(c.store.payments.get("p1").status, "pendente");
});

test("pagamento de outro provedor não é confirmado por aviso do Stripe", async () => {
  const c = setup([{ ...PAY, provider: "asaas", provider_ref: "cs_1", stripe_account_id: null }]);
  assert.equal((await deliver(c, paidEvent())).body.rejected, true);
  assert.equal(c.store.payments.get("p1").status, "pendente");
  assert.equal(c.store.log.confirm, 0);
});

test("pagamento histórico sem conta registrada continua confirmando (compatibilidade)", async () => {
  const c = setup([{ ...PAY, stripe_account_id: null }]);
  const r = await deliver(c, paidEvent({ account: "acct_1" }));
  assert.equal(r.status, 200);
  assert.equal(c.store.payments.get("p1").status, "confirmado");
});

test("referência desconhecida e sem id de pagamento: ignora", async () => {
  const c = setup();
  const ev = paidEvent(); ev.data.object = { id: "cs_x", payment_status: "paid" };
  assert.equal((await deliver(c, ev)).status, 200);
  assert.equal(c.store.log.confirm, 0);
});

// ---------- expiração ----------
test("sessão expirada: só falha o pagamento pendente correspondente", async () => {
  const c = setup([PAY, { id: "p2", provider_ref: "cs_2", status: "confirmado" }]);
  const exp = (id) => ({ id: `evt_${id}`, type: "checkout.session.expired", account: "acct_1", data: { object: { id, metadata: {} } } });
  await deliver(c, exp("cs_1"));
  await deliver(c, exp("cs_2"));
  assert.equal(c.store.payments.get("p1").status, "falhou");
  assert.equal(c.store.payments.get("p2").status, "confirmado");
});

test("sessão expirada de conta divergente não derruba o pagamento", async () => {
  const c = setup();
  const r = await deliver(c, { id: "evt_x", type: "checkout.session.expired", account: "acct_OUTRA", data: { object: { id: "cs_1" } } });
  assert.equal(r.body.rejected, true);
  assert.equal(c.store.payments.get("p1").status, "pendente");
});

// ---------- reembolso ----------
const RR = { id: "rr1", payment_id: "p1", status: "aprovado" };
const confirmedPay = { ...PAY, status: "confirmado" };

test("reembolso: um único reembolso no Stripe e pedido concluído", async () => {
  const c = setup([confirmedPay]);
  c.store.refundRequests.set("rr1", { ...RR });
  assert.equal(await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet }), null);
  assert.equal(c.fake.st.refundsCreated, 1);
  assert.equal(c.store.refundRequests.get("rr1").status, "reembolsado");
});

test("reembolso: queda depois da devolução no Stripe é recuperada sem devolver duas vezes", async () => {
  const c = setup([confirmedPay]);
  c.store.refundRequests.set("rr1", { ...RR });
  c.store.fail.completeRefund = 1; // o Stripe devolve, mas o registro local falha
  const err = await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet });
  assert.match(err, /completeRefund/);
  assert.equal(c.fake.st.refundsCreated, 1);
  assert.equal(c.store.refundRequests.get("rr1").status, "aprovado");
  // nova tentativa (mesmo depois de a chave de idempotência do Stripe expirar): reaproveita a devolução existente
  assert.equal(await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet }), null);
  assert.equal(c.fake.st.refundsCreated, 1);
  assert.equal(c.store.refundRequests.get("rr1").status, "reembolsado");
  assert.equal(c.store.log.completeRefund, 1);
});

test("reembolso: repetir depois de concluído não devolve nem lança de novo", async () => {
  const c = setup([confirmedPay]);
  c.store.refundRequests.set("rr1", { ...RR });
  await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet });
  await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet });
  assert.equal(c.fake.st.refundsCreated, 1);
  assert.equal(c.store.log.completeRefund, 1);
});

test("reembolso: pagamento sem referência/conta não chama o provedor", async () => {
  const c = setup([{ ...confirmedPay, provider_ref: null }]);
  assert.match(await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet }), /sem registro/);
  assert.equal(c.fake.st.refundsCreated, 0);
});

test("reembolso: pagamento de provedor não registrado não é devolvido por outro", async () => {
  const c = setup([{ ...confirmedPay, provider: "asaas" }]);
  const err = await core.executeRefund({ registry: c.registry, store: c.store, rr: RR, log: quiet });
  assert.match(err, /não disponível/);
  assert.equal(c.fake.st.refundsCreated, 0);
});

test("cancelamento: devolve cada pagamento confirmado uma vez; falha de uma não trava as outras", async () => {
  const c = setup([
    { ...confirmedPay, id: "a", provider_ref: "cs_a", reservation_id: "r9" },
    { ...confirmedPay, id: "b", provider_ref: "cs_b", reservation_id: "r9" },
    { ...confirmedPay, id: "c", provider_ref: null, reservation_id: "r9" },
  ]);
  const x = await core.settleSource({ registry: c.registry, store: c.store, kind: "reserva", sourceId: "r9", log: quiet });
  assert.deepEqual(x, { refunded: 2, failed: 1 });
  assert.equal(c.store.log.completeCancel, 2);
});

test("cancelamento: queda após a devolução e nova rodada não duplica a devolução", async () => {
  const c = setup([{ ...confirmedPay, reservation_id: "r9" }]);
  const orig = c.store.completeCancelRefund;
  let first = true;
  c.store.completeCancelRefund = async (id) => { if (first) { first = false; throw new Error("queda"); } return orig(id); };
  assert.deepEqual(await core.settleSource({ registry: c.registry, store: c.store, kind: "reserva", sourceId: "r9", log: quiet }), { refunded: 0, failed: 1 });
  assert.deepEqual(await core.settleSource({ registry: c.registry, store: c.store, kind: "reserva", sourceId: "r9", log: quiet }), { refunded: 1, failed: 0 });
  assert.equal(c.fake.st.refundsCreated, 1);
});

test("charge.refunded total conclui o pedido aprovado; parcial é ignorado", async () => {
  const c = setup([confirmedPay]);
  c.store.refundRequests.set("rr1", { ...RR });
  const ev = (id, refunded) => ({ id, type: "charge.refunded", account: "acct_1", data: { object: { amount: 10000, amount_refunded: refunded, metadata: { payment_id: "p1" } } } });
  await deliver(c, ev("evt_r1", 4000));
  assert.equal(c.store.refundRequests.get("rr1").status, "aprovado");
  await deliver(c, ev("evt_r2", 10000));
  assert.equal(c.store.refundRequests.get("rr1").status, "reembolsado");
});

test("charge.refunded de cancelamento (sem pedido) conclui o estorno", async () => {
  const c = setup([confirmedPay]);
  await deliver(c, { id: "evt_r3", type: "charge.refunded", account: "acct_1", data: { object: { amount: 10000, amount_refunded: 10000, metadata: { payment_id: "p1" } } } });
  assert.equal(c.store.payments.get("p1").status, "estornado");
});

test("charge.refunded de outra conta é rejeitado", async () => {
  const c = setup([confirmedPay]);
  c.store.refundRequests.set("rr1", { ...RR });
  const r = await deliver(c, { id: "evt_r4", type: "charge.refunded", account: "acct_OUTRA", data: { object: { amount: 100, amount_refunded: 100, metadata: { payment_id: "p1" } } } });
  assert.equal(r.body.rejected, true);
  assert.equal(c.store.refundRequests.get("rr1").status, "aprovado");
});

test("mensalidade paga depois de marcada pela casa: devolve o valor inteiro", async () => {
  const c = setup([{ ...PAY, member_due_id: "d1" }]);
  c.store.refundRequests.set("rr1", { ...RR });
  const orig = c.store.confirm;
  c.store.confirm = async (p) => { await orig(p); return "reembolso_pendente"; };
  await deliver(c, paidEvent());
  assert.equal(c.fake.st.refundsCreated, 1);
  assert.equal(c.store.refundRequests.get("rr1").status, "reembolsado");
});

// ---------- cobrança ----------
const openArgs = (c, pay, over = {}) => ({ registry: c.registry, store: c.store, pay, providerId: "stripe", houseAccount: "acct_1", title: "T", email: "a@b.c", appUrl: "https://app", expiresAt: 1999999999, log: quiet, ...over });

test("checkout: cria sessão nova e grava referência/conta no mesmo provedor", async () => {
  const c = setup([{ id: "p1", gross_cents: 10000, fee_cents: 1500, provider_ref: null, stripe_account_id: null }]);
  const r = await core.openCheckout(openArgs(c, c.store.payments.get("p1")));
  assert.equal(r.url, "https://pay/new");
  assert.deepEqual([c.store.payments.get("p1").provider, c.store.payments.get("p1").provider_ref, c.store.payments.get("p1").stripe_account_id], ["stripe", "cs_new", "acct_1"]);
});

test("checkout: reaproveita sessão aberta (não cria cobrança duplicada)", async () => {
  const c = setup();
  const r = await core.openCheckout(openArgs(c, c.store.payments.get("p1")));
  assert.equal(r.url, "https://pay/open");
  assert.ok(!c.fake.st.calls.includes("POST /v1/checkout/sessions"));
});

test("checkout: sessão antiga encerrada gera nova, mantendo provedor e conta", async () => {
  const c = setup(undefined, { sessionStatus: "expired" });
  const r = await core.openCheckout(openArgs(c, c.store.payments.get("p1")));
  assert.equal(r.url, "https://pay/new");
  assert.equal(c.store.payments.get("p1").provider, "stripe");
  assert.equal(c.store.payments.get("p1").stripe_account_id, "acct_1");
});

test("checkout: recusa trocar a conta de origem em silêncio", async () => {
  const c = setup();
  await assert.rejects(core.openCheckout(openArgs(c, c.store.payments.get("p1"), { houseAccount: "acct_NOVA" })), DivergenceError);
  assert.equal(c.store.payments.get("p1").stripe_account_id, "acct_1");
  assert.equal(c.fake.st.calls.length, 0);
});

test("checkout: recusa pagamento de outro provedor", async () => {
  const c = setup([{ ...PAY, provider: "asaas" }]);
  await assert.rejects(core.openCheckout(openArgs(c, c.store.payments.get("p1"))), DivergenceError);
  assert.equal(c.store.payments.get("p1").provider, "asaas");
});

test("checkout: falha ao gravar a cobrança aberta é propagada", async () => {
  const c = setup([{ id: "p1", gross_cents: 10000, fee_cents: 1500, provider_ref: null, stripe_account_id: null }]);
  c.store.fail.attach = 1;
  await assert.rejects(core.openCheckout(openArgs(c, c.store.payments.get("p1"))), /attach/);
});

// ---------- conferência manual ----------
test("sync: confirma quando o provedor diz pago, uma única vez", async () => {
  const c = setup();
  assert.deepEqual(await core.syncPayment({ registry: c.registry, store: c.store, pay: c.store.payments.get("p1"), log: quiet }), { status: "confirmado" });
  assert.deepEqual(await core.syncPayment({ registry: c.registry, store: c.store, pay: c.store.payments.get("p1"), log: quiet }), { status: "confirmado" });
  assert.equal(c.store.log.confirm, 1);
});

test("sync: não pago continua pendente", async () => {
  const c = setup(undefined, { paid: false });
  const r = await core.syncPayment({ registry: c.registry, store: c.store, pay: c.store.payments.get("p1"), log: quiet });
  assert.equal(r.status, "pendente");
  assert.equal(c.store.log.confirm, 0);
});

test("rotina: reembolsos pendentes + tarifas faltantes", async () => {
  const c = setup([{ ...confirmedPay, reservation_id: "r9" }]);
  c.store.sources = [{ kind: "reserva", id: "r9" }];
  assert.deepEqual(await core.sweep({ registry: c.registry, store: c.store, log: quiet }), { refunded: 1, failed: 0, fees_done: 0, fees_failed: 0 });
});
