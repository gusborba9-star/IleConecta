// Reativação da casa cancelada por reembolso: emite a fatura de reativação e abre o pagamento (banco e provedor simulados).
import test from "node:test";
import assert from "node:assert/strict";
import { reactivate } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";

const HOUSE = "22222222-2222-2222-2222-222222222222", CH = "11111111-1111-1111-1111-111111111111";
const silent = { error() {}, log() {} };

function setup({ issue = CH, charge = null } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const calls = { issue: [], attach: [] };
  const store = {
    config: async () => ({ enabled: true, provider: { plan: "fake" }, methods: { plan: ["pix", "card"] } }),
    houseOfOwner: async (u) => (u === "u1" ? HOUSE : null),
    houseOwner: async () => "u1",
    reactivationIssue: async (h, plan) => { calls.issue.push([h, plan]); if (issue instanceof Error) throw issue; return issue; },
    chargeById: async (id) => charge ?? { id, house_id: HOUSE, kind: "plan", status: "aberta", amount_cents: 17990, description: "Reativação do plano", due_date: "2026-11-13", provider: null, provider_ref: null },
    attach: async (...a) => { calls.attach.push(a); },
  };
  return { fake, registry, store, calls };
}

test("quem não tem casa não reativa", async () => {
  const t = setup();
  await assert.rejects(() => reactivate({ registry: t.registry, store: t.store, userId: "u9", email: "a@b.c", appUrl: "https://x.test", log: silent }), (e) => e.code === "forbidden");
  assert.equal(t.calls.issue.length, 0);
});

test("recusas do banco viram mensagem clara (casa não cancelada, plano sem mensalidade); erro desconhecido não vaza", async () => {
  for (const m of ["A casa não está cancelada por reembolso.", "Este plano não tem mensalidade para reativar. Fale com o suporte.", "Plano inválido."]) {
    const t = setup({ issue: new Error(m) });
    await assert.rejects(() => reactivate({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://x.test", log: silent }), (e) => e.code === "reactivation_denied" && e.message === m);
  }
  const t = setup({ issue: new Error('relation "x" does not exist') });
  await assert.rejects(() => reactivate({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://x.test", log: silent }), (e) => e.code !== "reactivation_denied");
});

test("resposta inesperada do banco não abre pagamento", async () => {
  const t = setup({ issue: null });
  await assert.rejects(() => reactivate({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://x.test", log: silent }), (e) => e.code === "reactivation_denied");
});

test("fatura de outra casa não é paga por aqui (a casa só abre a própria)", async () => {
  const t = setup();
  t.store.houseOwner = async () => "outro";
  await assert.rejects(() => reactivate({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://x.test", log: silent }), (e) => e.code === "forbidden");
});

test("o plano escolhido vai para o banco; sem escolha, vai vazio (o banco usa o plano atual)", async () => {
  const t = setup();
  await reactivate({ registry: t.registry, store: t.store, userId: "u1", plan: "maximo", method: "pix", email: "a@b.c", appUrl: "https://x.test", log: silent }).catch(() => {});
  await reactivate({ registry: t.registry, store: t.store, userId: "u1", email: "a@b.c", appUrl: "https://x.test", log: silent }).catch(() => {});
  assert.deepEqual(t.calls.issue, [[HOUSE, "maximo"], [HOUSE, null]]);
});
