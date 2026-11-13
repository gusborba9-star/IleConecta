// Card de atraso e lista de faturas da casa: o card existe só em atraso e some sozinho depois do pagamento.
import test from "node:test";
import assert from "node:assert/strict";
import { alertView, canPay, dayBefore, kindLabel, readStatus, shortDate, statusLabel, statusTone } from "../src/lib/platformBillingCore.js";

const ch = (o = {}) => ({ id: "c1", kind: "plan", description: "Mensalidade do plano", amount_cents: 8990, due_date: "2026-11-10", status: "vencida", tolerance_end: "2026-11-13", total_on: "2026-12-14", methods: ["pix", "card"], ...o });
const raw = (o = {}) => ({ house_id: "h1", level: "ok", overdue: true, charges: [ch()], ...o });

test("sem atraso não há card (nem para o resultado cru do banco, nem para o já lido)", () => {
  assert.equal(alertView(raw({ overdue: false, charges: [] })), null);
  assert.equal(alertView(readStatus(raw({ overdue: false, charges: [] }))), null);
  assert.equal(alertView(null), null);
  assert.equal(alertView(undefined), null);
  assert.equal(alertView("lixo"), null);
  assert.equal(alertView(raw({ overdue: true, charges: [] })), null, "atraso declarado sem nenhuma fatura não mostra card vazio");
});

test("pagou: o banco devolve sem atraso e o card some", () => {
  assert.ok(alertView(raw()));
  assert.equal(alertView(raw({ overdue: false, charges: [] })), null);
});

test("dentro da tolerância: aviso amarelo com o último dia para evitar a suspensão parcial", () => {
  const v = alertView(raw());
  assert.equal(v.tone, "gold");
  assert.equal(v.title, "Fatura em atraso");
  assert.match(v.text, /até 13\/11 para evitar a suspensão parcial/);
});

test("suspensão parcial: aviso forte, com o último dia ANTES do bloqueio total", () => {
  const v = alertView(raw({ level: "parcial" }));
  assert.equal(v.tone, "danger");
  assert.equal(v.title, "Suspensão parcial");
  assert.match(v.text, /Pague até 13\/12 para não ter o bloqueio total/);
  assert.match(v.text, /assistente/);
});

test("bloqueio total: pede para pagar e reativar", () => {
  const v = alertView(raw({ level: "total" }));
  assert.equal(v.tone, "danger");
  assert.equal(v.title, "Bloqueio total da casa");
  assert.match(v.text, /reativar/);
});

test("com várias faturas, vale o prazo mais curto e o total soma centavos inteiros", () => {
  const v = alertView(raw({ level: "parcial", charges: [ch({ id: "a", total_on: "2026-12-20", amount_cents: 8990 }), ch({ id: "b", total_on: "2026-12-14", amount_cents: 7980 })] }));
  assert.match(v.text, /até 13\/12/);
  assert.equal(v.totalCents, 16970);
  assert.equal(v.charges.length, 2);
});

test("pagamento em análise: o card continua (a fatura não foi baixada) mas pede para aguardar", () => {
  const v = alertView(raw({ charges: [ch({ status: "em_processamento" })] }));
  assert.equal(v.processing, true);
  assert.match(v.text, /em análise/);
  assert.equal(canPay(v.charges[0]), false);
  const mixed = alertView(raw({ charges: [ch({ status: "em_processamento" }), ch({ id: "c2", status: "vencida" })] }));
  assert.equal(mixed.processing, false);
});

test("leitura defensiva: lixo vira normal, nada é inventado", () => {
  assert.deepEqual(readStatus(null), { houseId: null, level: "ok", overdue: false, charges: [] });
  assert.equal(readStatus({ level: "hacker", overdue: true, charges: [{ id: "x" }] }).level, "ok");
  const s = readStatus(raw({ charges: [ch({ amount_cents: "abc", methods: ["pix", "boleto", 7] }), { id: "" }, null] }));
  assert.equal(s.charges.length, 1);
  assert.equal(s.charges[0].amountCents, 0);
  assert.deepEqual(s.charges[0].methods, ["pix"]);
});

test("datas e rótulos", () => {
  assert.equal(shortDate("2026-11-10"), "10/11");
  assert.equal(shortDate("lixo"), "");
  assert.equal(dayBefore("2026-12-14"), "2026-12-13");
  assert.equal(dayBefore("2026-01-01"), "2025-12-31");
  assert.equal(dayBefore("2026-03-01"), "2026-02-28");
  assert.equal(dayBefore(""), "");
  assert.equal(statusLabel("vencida"), "Vencida");
  assert.equal(statusLabel("zzz"), "zzz");
  assert.equal(statusTone("paga"), "forest");
  assert.equal(statusTone("vencida"), "danger");
  assert.equal(kindLabel("boost"), "Impulsionamento");
  assert.equal(kindLabel("zzz"), "Cobrança da plataforma");
  assert.equal(canPay({ status: "aberta" }) && canPay({ status: "vencida" }), true);
  assert.equal(canPay({ status: "paga" }) || canPay(null) || canPay({ status: "cancelada" }), false);
});
