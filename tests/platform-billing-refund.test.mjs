// Reembolso de créditos em 7 dias: pedido da casa, estorno no provedor, repetição segura e falhas (provedor e banco simulados).
import test from "node:test";
import assert from "node:assert/strict";
import { creditRefund, planRefund, settleRefunds, sweep } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";
import { interpretRefund } from "../supabase/functions/platform-billing/logic.js";
import { createStripeAdapter } from "../supabase/functions/platform-billing/stripeAdapter.js";

const CH = "11111111-1111-1111-1111-111111111111", HOUSE = "22222222-2222-2222-2222-222222222222", RF = "33333333-3333-3333-3333-333333333333";
const silent = { error() {}, log() {} };

function setup({ begin = null, pending = [], planPending = [] } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const calls = { begin: [], done: [], fail: [], pbegin: [], pdone: [], pfail: [] };
  const b = { refund_id: RF, provider: "fake", ref: "cs_pay_1", amount_cents: 4242, credits: 170, resume: false };
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" } }),
    houseOfOwner: async (u) => (u === "u1" ? HOUSE : null),
    refundBegin: async (h, c, by) => { calls.begin.push([h, c, by]); if (begin instanceof Error) throw begin; return begin ?? b; },
    refundDone: async (id, ref) => { calls.done.push([id, ref]); },
    refundFail: async (id, err) => { calls.fail.push([id, err]); },
    refundsPending: async () => pending,
    planRefundBegin: async (h, c, by) => { calls.pbegin.push([h, c, by]); if (begin instanceof Error) throw begin; return begin ?? { ...b, credits: undefined }; },
    planRefundDone: async (id, ref) => { calls.pdone.push([id, ref]); },
    planRefundFail: async (id, err) => { calls.pfail.push([id, err]); },
    planRefundsPending: async () => planPending,
    tick: async () => ({}), autoEnabled: async () => false, autoDue: async () => [], openWithRef: async () => [], paidWithoutFee: async () => [],
  };
  return { fake, registry, store, calls, b };
}

test("reembolso aprovado: pede o estorno do valor exato com chave por reembolso e conclui no banco", async () => {
  const t = setup();
  const r = await creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent });
  assert.deepEqual(r, { status: "done", amount_cents: 4242 });
  assert.deepEqual(t.calls.begin[0], [HOUSE, CH, "u1"]);
  const [[key, sent]] = [...t.fake.refunds.entries()];
  assert.equal(key, `pbrefund:${RF}`);
  assert.equal(sent.amountCents, 4242);
  assert.equal(sent.paidRef, "cs_pay_1");
  assert.equal(t.calls.done.length, 1);
  assert.equal(t.calls.fail.length, 0);
});

test("quem não tem casa não pede reembolso", async () => {
  const t = setup();
  await assert.rejects(() => creditRefund({ registry: t.registry, store: t.store, userId: "u9", chargeId: CH, log: silent }), /Somente a casa/);
  assert.equal(t.calls.begin.length, 0);
});

test("recusas do banco de dados viram mensagem para a casa; erro desconhecido não vaza detalhe", async () => {
  for (const m of ["O prazo de 7 dias para reembolso já passou.", "Todos os créditos deste pacote já foram usados.", "Esta compra já foi reembolsada.", "Esta compra não pode ser reembolsada."]) {
    const t = setup({ begin: new Error(m) });
    await assert.rejects(() => creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code === "refund_denied" && e.message === m);
    assert.equal(t.fake.refunds.size, 0, "nada é pedido ao provedor");
  }
  const t = setup({ begin: new Error('relation "x" does not exist') });
  await assert.rejects(() => creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code !== "refund_denied");
});

test("sem resposta do provedor (rede/erro): fica pendente, não conclui e não devolve o saldo", async () => {
  for (const script of ["erro", "null"]) {
    const t = setup(); t.fake.refundScript.push(script);
    const r = await creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent });
    assert.equal(r.status, "pending");
    assert.equal(t.calls.done.length + t.calls.fail.length, 0);
  }
});

test("recusa definitiva do provedor: devolve o saldo (banco) e avisa a casa; nada é concluído", async () => {
  const t = setup(); t.fake.refundScript.push("failed");
  await assert.rejects(() => creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code === "refund_failed");
  assert.equal(t.calls.fail.length, 1);
  assert.equal(t.calls.done.length, 0);
});

test("a rotina refaz o pendente com a MESMA chave: um só estorno no provedor, concluído uma vez", async () => {
  const t = setup({ pending: [{ refund_id: RF, provider: "fake", ref: "cs_pay_1", amount_cents: "4242" }] });
  t.fake.refundScript.push("erro");
  assert.equal((await creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent })).status, "pending");
  const r = await settleRefunds({ registry: t.registry, store: t.store, log: silent });
  assert.deepEqual([r.pending, r.done, r.errors.length], [1, 1, 0]);
  assert.equal(t.fake.refunds.size, 1);
  assert.equal(t.calls.done.length, 1);
  await settleRefunds({ registry: t.registry, store: t.store, log: silent });
  assert.equal(t.fake.refunds.size, 1, "repetir não estorna de novo");
});

test("pedido repetido (resume) usa a mesma chave e não duplica o estorno", async () => {
  const t = setup({ begin: { refund_id: RF, provider: "fake", ref: "cs_pay_1", amount_cents: 4242, credits: 170, resume: true } });
  await creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent });
  await creditRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent });
  assert.equal(t.fake.refunds.size, 1);
});

test("a rotina diária inclui os reembolsos e um erro deles não derruba o resto", async () => {
  const t = setup(); t.store.refundsPending = async () => { throw new Error("banco fora"); };
  const out = await sweep({ registry: t.registry, store: t.store, log: silent });
  assert.ok(out.errors.some((e) => /refund:/.test(e)));
  assert.deepEqual(out.tick, {});
});

test("interpretar o estorno do Stripe: aceito/pendente = ok; pedido inválido = falha; resto = não sabemos", () => {
  assert.deepEqual(interpretRefund({ ok: true, status: 200, data: { id: "re_1", status: "succeeded" } }), { outcome: "done", ref: "re_1" });
  assert.equal(interpretRefund({ ok: true, status: 200, data: { id: "re_2", status: "pending" } }).outcome, "done", "Pix: a caminho");
  assert.equal(interpretRefund({ ok: true, status: 200, data: { id: "re_3", status: "failed", failure_reason: "expired_or_canceled_card" } }).outcome, "failed");
  assert.equal(interpretRefund({ ok: false, status: 400, data: { error: { type: "invalid_request_error", code: "amount_too_large" } } }).outcome, "failed");
  for (const unknown of [{ ok: false, status: 400, data: { error: { type: "invalid_request_error", code: "charge_already_refunded" } } }, { ok: false, status: 400, data: { error: { type: "idempotency_error" } } }, { ok: false, status: 429, data: {} }, { ok: false, status: 500, data: {} }, { ok: true, status: 200, data: { status: "???" } }]) {
    assert.equal(interpretRefund(unknown), null);
  }
});

test("adaptador Stripe: acha o pagamento pela página, estorna o valor exato com a chave, e cobre os desfechos", async () => {
  const reqs = [];
  const responses = [
    { status: 200, body: { id: "cs_x", payment_intent: "pi_77" } },
    { status: 200, body: { id: "re_9", status: "succeeded" } },
    { status: 400, body: { error: { type: "invalid_request_error", code: "amount_too_large" } } },
    { status: 503, body: {} },
  ];
  const fetchImpl = async (url, o) => { reqs.push({ url, o }); const r = responses.shift(); return { ok: r.status < 400, status: r.status, json: async () => r.body }; };
  const a = createStripeAdapter({ secret: "sk_test_x", webhookSecret: "w", fetchImpl, log: silent });
  assert.deepEqual(await a.refund({ ref: "cs_x", amountCents: 4242, idempotencyKey: "pbrefund:1" }), { outcome: "done", ref: "re_9" });
  assert.match(reqs[0].url, /checkout\/sessions\/cs_x/);
  assert.match(reqs[1].url, /\/v1\/refunds$/);
  assert.equal(reqs[1].o.headers["Idempotency-Key"], "pbrefund:1");
  assert.match(reqs[1].o.body, /payment_intent=pi_77/); assert.match(reqs[1].o.body, /amount=4242/);
  responses.unshift({ status: 200, body: { id: "x", payment_intent: "pi_77" } });
  assert.equal((await a.refund({ ref: "cs_x", amountCents: 1, idempotencyKey: "k" })).outcome, "failed");
  responses.unshift({ status: 200, body: { id: "x", payment_intent: "pi_77" } });
  assert.equal(await a.refund({ ref: "cs_x", amountCents: 1, idempotencyKey: "k2" }), null);
  await assert.rejects(() => a.refund({ ref: "algo_estranho", amountCents: 1, idempotencyKey: "k3" }));
  const direct = []; const a2 = createStripeAdapter({ secret: "sk_test_x", webhookSecret: "w", fetchImpl: async (u, o) => { direct.push(u); return { ok: true, status: 200, json: async () => ({ id: "re_1", status: "pending" }) }; }, log: silent });
  assert.equal((await a2.refund({ ref: "pi_55", amountCents: 100, idempotencyKey: "k4" })).outcome, "done");
  assert.deepEqual(direct.length, 1, "pagamento já conhecido (pi_) não consulta a página");
});

test("reembolso do plano: estorno integral, conclui no banco com a função do plano (não a de créditos)", async () => {
  const t = setup();
  const r = await planRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent });
  assert.deepEqual(r, { status: "done", amount_cents: 4242 });
  assert.deepEqual(t.calls.pbegin[0], [HOUSE, CH, "u1"]);
  assert.equal(t.calls.pdone.length, 1);
  assert.equal(t.calls.done.length + t.calls.begin.length, 0);
});

test("reembolso do plano: recusas do banco viram mensagem; quem não tem casa não pede", async () => {
  for (const m of ["O prazo de 7 dias para reembolso já passou.", "O reembolso de 7 dias vale só para o primeiro pagamento do plano.", "O reembolso de 7 dias do plano já foi usado por esta casa.", "Esta cobrança não pode ser reembolsada."]) {
    const t = setup({ begin: new Error(m) });
    await assert.rejects(() => planRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code === "refund_denied" && e.message === m);
    assert.equal(t.fake.refunds.size, 0);
  }
  const t = setup();
  await assert.rejects(() => planRefund({ registry: t.registry, store: t.store, userId: "u9", chargeId: CH, log: silent }), /Somente a casa/);
});

test("reembolso do plano recusado pelo provedor: registra a falha e avisa que a assinatura foi mantida", async () => {
  const t = setup();
  t.fake.script = { refund: "falha" };
  const orig = t.registry.byId("fake").refund;
  t.registry.byId("fake").refund = async () => ({ outcome: "failed", code: "recusado" });
  await assert.rejects(() => planRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code === "refund_failed" && /assinatura foi mantida/.test(e.message));
  assert.equal(t.calls.pfail.length, 1);
  assert.equal(t.calls.pdone.length, 0);
  t.registry.byId("fake").refund = orig;
});

test("a rotina também refaz os reembolsos de plano pendentes", async () => {
  const t = setup({ planPending: [{ refund_id: RF, provider: "fake", ref: "cs_pay_1", amount_cents: 17990 }] });
  const r = await settleRefunds({ registry: t.registry, store: t.store, log: silent });
  assert.equal(r.pending, 1); assert.equal(r.done, 1);
  assert.equal(t.calls.pdone.length, 1); assert.equal(t.calls.done.length, 0);
});
