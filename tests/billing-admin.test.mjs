import test from "node:test";
import assert from "node:assert/strict";
import { buildConfig, canCancel, needsEnableConfirm, readAdminCharge, readConfig, toggleMethod } from "../src/lib/billingAdminCore.js";

const db = { enabled: false, notice_days: 3, tolerance_business_days: 3, total_block_days: 30,
  provider: { plan: "stripe", extra_seat: "stripe", credit_pack: "stripe", highlight: "stripe", boost: "stripe" },
  methods: { plan: ["card", "card_recurring", "pix"], extra_seat: ["card", "pix"], credit_pack: ["card", "pix"], highlight: ["pix"], boost: ["card"] } };

test("ler e montar devolve o mesmo objeto do banco (ida e volta)", () => {
  const r = buildConfig(readConfig(db));
  assert.equal(r.ok, true);
  const sorted = (c) => ({ ...c, methods: Object.fromEntries(Object.entries(c.methods).map(([k, v]) => [k, [...v].sort()])) });
  assert.deepEqual(sorted(r.value), sorted(db), "a ordem dos meios não importa; o conteúdo é idêntico");
});

test("lixo ou vazio vira cobrança desligada e valores padrão", () => {
  for (const bad of [null, undefined, "x", 5, [], {}]) {
    const f = readConfig(bad);
    assert.equal(f.enabled, false);
    assert.equal(f.toleranceDays, 3);
    assert.equal(f.totalDays, 30);
    assert.equal(buildConfig(f).ok, true);
  }
  assert.equal(readConfig({ enabled: "true" }).enabled, false, "só o booleano verdadeiro liga");
});

test("faixas: aviso 1–15, tolerância 0–10, bloqueio total 7–90", () => {
  const f = readConfig(db);
  const t = (patch) => buildConfig({ ...f, ...patch }).ok;
  assert.equal(t({ noticeDays: "0" }), false);
  assert.equal(t({ noticeDays: "16" }), false);
  assert.equal(t({ noticeDays: "15" }), true);
  assert.equal(t({ toleranceDays: "-1" }), false);
  assert.equal(t({ toleranceDays: "11" }), false);
  assert.equal(t({ toleranceDays: "0" }), true);
  assert.equal(t({ totalDays: "6" }), false);
  assert.equal(t({ totalDays: "91" }), false);
  assert.equal(t({ totalDays: "90" }), true);
  assert.equal(t({ totalDays: "" }), false);
  assert.equal(t({ totalDays: "3,5" }), false);
  assert.equal(t({ totalDays: "1e1" }), false);
  assert.equal(t({ totalDays: " 30 " }), true);
});

test("cada cobrança precisa de ao menos um meio de pagamento; provedor inválido é recusado", () => {
  const f = readConfig(db);
  assert.equal(buildConfig({ ...f, methods: { ...f.methods, plan: [] } }).ok, false);
  assert.equal(buildConfig({ ...f, provider: { ...f.provider, plan: "Stripe!" } }).ok, false);
  assert.equal(buildConfig({ ...f, provider: { ...f.provider, plan: "pagarme" } }).ok, true);
});

test("meios na ordem do banco e sem repetição", () => {
  assert.deepEqual(toggleMethod(["pix"], "card"), ["pix", "card"]);
  assert.deepEqual(toggleMethod(["pix", "card"], "pix"), ["card"]);
  assert.deepEqual(toggleMethod(["card", "pix"], "card_recurring"), ["pix", "card", "card_recurring"]);
});

test("confirmação só ao ligar a cobrança", () => {
  assert.equal(needsEnableConfirm({ enabled: false }, { enabled: true }), true);
  assert.equal(needsEnableConfirm({ enabled: true }, { enabled: true }), false);
  assert.equal(needsEnableConfirm({ enabled: true }, { enabled: false }), false);
});

test("fatura da administração: tarifa desconhecida continua nula, nunca zero", () => {
  assert.equal(readAdminCharge({ id: "a", amount_cents: 8990 }).feeCents, null);
  assert.equal(readAdminCharge({ id: "a", amount_cents: 8990, processor_fee_cents: 0 }).feeCents, 0);
  assert.equal(readAdminCharge(null).amountCents, 0);
});

test("só fatura em aberto pode ser cancelada", () => {
  for (const s of ["aberta", "vencida", "em_processamento"]) assert.equal(canCancel(s), true);
  for (const s of ["paga", "cancelada", "estornada", "", "x"]) assert.equal(canCancel(s), false);
});
