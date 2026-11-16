// Vaga extra de equipe no app: só a casa contrata, só as recusas conhecidas do banco viram mensagem, e o pagamento abre pela cobrança de vaga.
import test from "node:test";
import assert from "node:assert/strict";
import { seat } from "../supabase/functions/platform-billing/core.js";
import { createFakeProvider } from "../supabase/functions/platform-billing/fakeProvider.js";
import { createRegistry } from "../supabase/functions/platform-billing/provider.js";

const HOUSE = "22222222-2222-2222-2222-222222222222", CH = "11111111-1111-1111-1111-111111111111";
const silent = { error() {}, log() {} };

function setup({ issue = CH } = {}) {
  const fake = createFakeProvider({ id: "fake" });
  const registry = createRegistry([fake]);
  const calls = { seat: [], attach: [] };
  const store = {
    config: async () => ({ enabled: true, provider: { extra_seat: "fake" }, methods: { extra_seat: ["pix", "card"] } }),
    houseOfOwner: async (u) => (u === "u1" ? HOUSE : null),
    houseOwner: async () => "u1",
    seatIssue: async (h) => { calls.seat.push(h); if (issue instanceof Error) throw issue; return issue; },
    chargeById: async (id) => ({ id, house_id: HOUSE, kind: "extra_seat", status: "aberta", amount_cents: 2660, description: "Vaga adicional de equipe (valor proporcional)", due_date: "2026-11-15", provider: null, provider_ref: null, idempotency_key: "upgrade:seat:x:20261115:1", pix_discount_cents: 0, pix_discount_until: null }),
    refCount: async () => 0,
    payable: async () => 2660,
    attach: async (...a) => { calls.attach.push(a); },
  };
  return { registry, store, calls };
}
const args = (t, extra = {}) => ({ registry: t.registry, store: t.store, userId: "u1", method: "pix", email: "a@b.c", appUrl: "https://x.test", log: silent, ...extra });

test("só a casa contrata vaga; quem não é dona nunca chega ao banco", async () => {
  const t = setup();
  await assert.rejects(() => seat(args(t, { userId: "u9" })), (e) => e.code === "forbidden");
  assert.equal(t.calls.seat.length, 0);
});

test("a casa dona pede a vaga e o pagamento abre pela cobrança emitida", async () => {
  const t = setup();
  const r = await seat(args(t));
  assert.deepEqual(t.calls.seat, [HOUSE]);
  assert.ok(r.url, "devolve o endereço do pagamento");
  assert.equal(t.calls.attach.length, 1);
});

test("recusas conhecidas do banco viram mensagem clara", async () => {
  const known = [
    "A cobrança da plataforma ainda não está ativa.",
    "A casa não tem assinatura ativa.",
    "Há uma fatura em atraso. Regularize o pagamento antes de contratar a vaga.",
    "Há uma redução de vagas agendada. Desfaça a redução antes de contratar outra vaga.",
    "A casa já está no limite de 20 vagas extras.",
    "Este plano não tem vaga adicional na tabela.",
    "Informe o CPF ou CNPJ da casa em Planos antes de contratar.",
    "A fatura de vagas da próxima renovação já foi gerada. A contratação de uma nova vaga fica disponível depois do vencimento dela.",
    "A renovação está muito próxima e o valor fica abaixo do mínimo de cobrança. A contratação fica disponível depois da renovação.",
  ];
  for (const m of known) {
    const t = setup({ issue: new Error(m) });
    await assert.rejects(() => seat(args(t)), (e) => e.code === "plan_change_denied" && e.message === m);
  }
});

test("erro desconhecido não vaza detalhe como mensagem de recusa", async () => {
  const t = setup({ issue: new Error('relation "platform_charges" does not exist') });
  await assert.rejects(() => seat(args(t)), (e) => e.code !== "plan_change_denied");
});

test("retorno inesperado do banco (sem id) não abre pagamento", async () => {
  for (const bad of [null, 0, 42, {}]) {
    const t = setup({ issue: bad });
    await assert.rejects(() => seat(args(t)), (e) => e.code === "plan_change_denied");
    assert.equal(t.calls.attach.length, 0);
  }
});
