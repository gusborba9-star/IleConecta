// Desconto de pontualidade no Pix: a página do Pix cobra o valor descontado, o cartão o cheio, e a confirmação só aceita o valor pedido naquela página.
import test from "node:test";
import assert from "node:assert/strict";
import { openPayment, settleRef } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry, DivergenceError } from "../supabase/functions/platform-billing/provider.js";

function setup({ discount = 500, windowOpen = true } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const charge = { id: "c1", house_id: "h1", kind: "plan", amount_cents: "10000", description: "Mensalidade do plano", status: "aberta", provider: null, provider_ref: null, provider_method: null };
  const refs = new Map(); const confirms = [];
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" }, methods: { plan: ["pix", "card"] } }),
    chargeById: async () => charge,
    houseOwner: async () => "u1",
    refCount: async () => refs.size,
    payable: async (_id, method) => (method === "pix" && windowOpen ? 10000 - discount : 10000),
    attach: async (_id, prov, ref, method, url, amount) => { refs.set(ref, amount); charge.provider = prov; charge.provider_ref = ref; charge.provider_method = method; charge.checkout_url = url; },
    chargeIdByRef: async (_p, ref) => (refs.has(ref) ? "c1" : null),
    expected: async (_p, ref) => refs.get(ref) ?? 10000,
    confirm: async (_p, ref, paid) => { if (paid !== (refs.get(ref) ?? 10000)) throw new Error("valor_divergente"); confirms.push([ref, paid]); charge.status = "paga"; return { duplicate: false }; },
    progress: async () => {},
  };
  const base = { registry, store, chargeId: "c1", userId: "u1", email: "a@b.c", appUrl: "https://app.example", nowMs: 1_800_000_000_000 };
  return { fake, store, charge, refs, confirms, base };
}

test("Pix: a página cobra o valor com desconto e a referência guarda esse valor", async () => {
  const { fake, refs, base } = setup();
  const r = await openPayment({ ...base, method: "pix" });
  const ref = [...refs.keys()][0];
  assert.equal(fake.sessions.get(ref).amountCents, 9500);
  assert.equal(refs.get(ref), 9500);
  assert.match(r.url, /^https:\/\/pay\.example\//);
});

test("cartão: sempre o valor cheio", async () => {
  const { fake, refs, base } = setup();
  await openPayment({ ...base, method: "card" });
  const ref = [...refs.keys()][0];
  assert.equal(fake.sessions.get(ref).amountCents, 10000);
  assert.equal(refs.get(ref), 10000);
});

test("sem escolher o meio (página com cartão e Pix): valor cheio, nunca o descontado", async () => {
  const { fake, refs, base } = setup();
  await openPayment({ ...base });
  assert.equal(fake.sessions.get([...refs.keys()][0]).amountCents, 10000);
});

test("fora do prazo, o Pix volta ao valor cheio", async () => {
  const { fake, refs, base } = setup({ windowOpen: false });
  await openPayment({ ...base, method: "pix" });
  assert.equal(fake.sessions.get([...refs.keys()][0]).amountCents, 10000);
});

test("pagamento do Pix com desconto é baixado pelo valor pedido", async () => {
  const { fake, refs, confirms, base } = setup();
  await openPayment({ ...base, method: "pix" });
  const ref = [...refs.keys()][0];
  fake.markPaid(ref, { feeCents: 114 });
  const adapter = base.registry.byId("fake");
  const res = await settleRef({ store: base.store, adapter, ref });
  assert.equal(res.outcome, "paid");
  assert.deepEqual(confirms, [[ref, 9500]]);
});

test("valor pago diferente do pedido é divergência (nada é baixado)", async () => {
  for (const wrong of [10000, 9000, 9501]) {
    const { fake, refs, confirms, base } = setup();
    await openPayment({ ...base, method: "pix" });
    const ref = [...refs.keys()][0];
    fake.markPaid(ref, { amountCents: wrong });
    await assert.rejects(() => settleRef({ store: base.store, adapter: base.registry.byId("fake"), ref }), DivergenceError);
    assert.equal(confirms.length, 0);
  }
});

test("o valor cheio pago no cartão continua sendo aceito", async () => {
  const { fake, refs, confirms, base } = setup();
  await openPayment({ ...base, method: "card" });
  const ref = [...refs.keys()][0];
  fake.markPaid(ref, {});
  await settleRef({ store: base.store, adapter: base.registry.byId("fake"), ref });
  assert.deepEqual(confirms, [[ref, 10000]]);
});

test("valor do banco inválido não abre pagamento", async () => {
  const { base, store } = setup();
  store.payable = async () => 0;
  await assert.rejects(() => openPayment({ ...base, method: "pix" }), /calcular o valor/);
});
