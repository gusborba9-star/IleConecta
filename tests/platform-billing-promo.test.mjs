// Destaque e impulsionamento: reembolso proporcional (servidor de cobrança), mensagens de compra e volta do pagamento.
import test from "node:test";
import assert from "node:assert/strict";
import { promoRefund, settleRefunds, sweep } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";
import { promoPurchaseError, returnPath, buildCheckoutParams } from "../supabase/functions/platform-billing/logic.js";

const CH = "11111111-1111-1111-1111-111111111111", HOUSE = "22222222-2222-2222-2222-222222222222", RF = "33333333-3333-3333-3333-333333333333";
const silent = { error() {}, log() {} };
function setup({ begin = null, pending = [] } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const calls = { begin: [], done: [], fail: [], other: 0, ticks: 0 };
  const b = { refund_id: RF, provider: "fake", ref: "cs_pay_1", amount_cents: 15920, resume: false };
  const store = {
    config: async () => ({ enabled: true }),
    houseOfOwner: async (u) => (u === "u1" ? HOUSE : null),
    promoRefundBegin: async (h, c, by) => { calls.begin.push([h, c, by]); if (begin instanceof Error) throw begin; return begin ?? b; },
    promoRefundDone: async (id, ref) => { calls.done.push([id, ref]); },
    promoRefundFail: async (id, err) => { calls.fail.push([id, err]); },
    promoRefundsPending: async () => pending,
    promoTick: async () => { calls.ticks++; return { ended: 1 }; },
    refundDone: async () => { calls.other++; }, planRefundDone: async () => { calls.other++; },
    refundsPending: async () => [], planRefundsPending: async () => [],
    tick: async () => ({}), autoEnabled: async () => false, autoDue: async () => [], openWithRef: async () => [], paidWithoutFee: async () => [],
  };
  return { fake, registry, store, calls };
}

test("reembolso de destaque/impulso: estorna o valor exato e conclui com a função de destaque (não a de créditos nem a de plano)", async () => {
  const t = setup();
  const r = await promoRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent });
  assert.deepEqual(r, { status: "done", amount_cents: 15920 });
  assert.deepEqual(t.calls.begin[0], [HOUSE, CH, "u1"]);
  assert.equal(t.calls.done.length, 1);
  assert.equal(t.calls.other, 0);
  assert.equal([...t.fake.refunds.keys()][0], `pbrefund:${RF}`);
});

test("recusas do banco viram mensagem; quem não é casa não pede", async () => {
  for (const m of ["O prazo de 7 dias para reembolso já passou.", "Esta compra não está ativa.", "Todos os dias desta compra já começaram.", "Esta compra já foi reembolsada."]) {
    const t = setup({ begin: new Error(m) });
    await assert.rejects(() => promoRefund({ registry: t.registry, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code === "refund_denied" && e.message === m);
  }
  const t = setup();
  await assert.rejects(() => promoRefund({ registry: t.registry, store: t.store, userId: "u9", chargeId: CH, log: silent }), /Somente a casa/);
});

test("provedor recusa de vez: dias devolvidos à compra (função de falha de destaque) e mensagem clara", async () => {
  const t = setup();
  t.fake.refund = async () => ({ outcome: "failed", code: "recusado" });
  const reg = createRegistry([{ ...t.fake, id: "fake", refund: async () => ({ outcome: "failed", code: "recusado" }) }]);
  await assert.rejects(() => promoRefund({ registry: reg, store: t.store, userId: "u1", chargeId: CH, log: silent }), (e) => e.code === "refund_failed" && /dias foram mantidos/.test(e.message));
  assert.equal(t.calls.fail.length, 1);
  assert.equal(t.calls.done.length, 0);
});

test("a rotina refaz reembolsos pendentes de destaque e roda a rotina de destaque (encerrar, avisar, fila)", async () => {
  const t = setup({ pending: [{ refund_id: RF, provider: "fake", ref: "cs_pay_1", amount_cents: 9950 }] });
  const s = await settleRefunds({ registry: t.registry, store: t.store, log: silent });
  assert.equal(s.done, 1);
  assert.equal(t.calls.done.length, 1);
  const t2 = setup();
  const out = await sweep({ registry: t2.registry, store: t2.store, log: silent });
  assert.equal(t2.calls.ticks, 1);
  assert.deepEqual(out.promo, { ended: 1 });
  const t3 = setup(); t3.store.promoTick = async () => { throw new Error("banco fora"); };
  const out3 = await sweep({ registry: t3.registry, store: t3.store, log: silent });
  assert.ok(out3.errors.some((e) => /promo: banco fora/.test(e)));
});

test("mensagens de compra: só frases conhecidas passam, nada técnico vaza", () => {
  assert.match(promoPurchaseError("sem_vaga"), /lista de espera/);
  assert.match(promoPurchaseError("Marque a autorização de início imediato para continuar."), /autorização/);
  assert.equal(promoPurchaseError("O impulsionamento precisa terminar antes do ritual: no máximo 6 dia(s) para este ritual."), "O impulsionamento precisa terminar antes do ritual: no máximo 6 dia(s) para este ritual.");
  assert.match(promoPurchaseError("Complete a cidade e o estado no perfil da casa para contratar por cidade."), /cidade e o estado/);
  assert.equal(promoPurchaseError('relation "promotions" does not exist'), "Não foi possível iniciar a contratação agora. Tente de novo.");
  assert.equal(promoPurchaseError(undefined), "Não foi possível iniciar a contratação agora. Tente de novo.");
});

test("depois de pagar, a casa volta para a tela de onde saiu", () => {
  assert.equal(returnPath("highlight"), "/destaques");
  assert.equal(returnPath("boost"), "/impulsionar");
  assert.equal(returnPath("plan"), "/planos");
  assert.equal(returnPath("credit_pack"), "/planos");
  const p = buildCheckoutParams({ charge: { id: CH, house_id: HOUSE, kind: "highlight", amount_cents: 8970, description: "x" }, methods: ["card"], appUrl: "https://app.test", email: null, expiresAtSec: 9999999999 });
  assert.equal(p.success_url, `https://app.test/destaques?fatura=${CH}&retorno=pago`);
  assert.equal(p.cancel_url, `https://app.test/destaques?fatura=${CH}&retorno=cancelado`);
});

test("publicação é item válido e as mensagens novas do banco chegam à casa", async () => {
  const { PROMO_ITEMS, promoPurchaseError } = await import("../supabase/functions/platform-billing/logic.js");
  assert.ok(PROMO_ITEMS.includes("post"));
  assert.equal(promoPurchaseError("Só publicações da sua casa podem ser impulsionadas."), "Só publicações da sua casa podem ser impulsionadas.");
  assert.match(promoPurchaseError("Escolha o serviço, ritual ou publicação que será impulsionado."), /serviço, ritual ou publicação/);
  assert.match(promoPurchaseError("erro qualquer do banco"), /Não foi possível/);
});
