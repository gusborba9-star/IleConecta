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

import { cardView, payMethods } from "../src/lib/platformBillingCore.js";

test("botões de pagamento: cartão recorrente vira cartão comum, sem repetir, e desconhecidos somem", () => {
  assert.deepEqual(payMethods(["pix", "card", "card_recurring"]), ["pix", "card"]);
  assert.deepEqual(payMethods(["card_recurring"]), ["card"]);
  assert.deepEqual(payMethods(["boleto", 3, null]), []);
  assert.deepEqual(payMethods(undefined), []);
  assert.deepEqual(readStatus({ house_id: "h", level: "ok", overdue: true, charges: [{ id: "c", methods: ["card", "card_recurring", "pix"] }] }).charges[0].methods, ["card", "pix"]);
});

test("cartão salvo: indisponível não mostra nada; sem cartão convida a cadastrar; ligado explica as 3 tentativas", () => {
  assert.equal(cardView(null), null);
  assert.equal(cardView({ hasHouse: false }), null);
  assert.equal(cardView({ hasHouse: true, available: false }), null);
  const none = cardView({ hasHouse: true, available: true, hasCard: false });
  assert.equal(none.hasCard, false); assert.equal(none.on, false); assert.match(none.title, /Nenhum cartão/);
  const on = cardView({ hasHouse: true, available: true, hasCard: true, brand: "visa", last4: "4242", expMonth: 12, expYear: 2031, autoEnabled: true, maxAttempts: 3 }, "2026-11-13");
  assert.equal(on.title, "Visa final 4242"); assert.equal(on.expiry, "validade 12/31"); assert.equal(on.on, true); assert.equal(on.expired, false);
  assert.match(on.summary, /até 3 tentativas/);
  const off = cardView({ hasHouse: true, available: true, hasCard: true, brand: "mastercard", last4: "1111", autoEnabled: false, maxAttempts: 3 });
  assert.equal(off.on, false); assert.match(off.summary, /desligada/);
});

test("cartão salvo: cartão vencido é sinalizado; recusa mostra o aviso para pagar ou trocar; aprovada é só informação", () => {
  const base = { hasHouse: true, available: true, hasCard: true, brand: "visa", last4: "4242", autoEnabled: true, maxAttempts: 3 };
  assert.equal(cardView({ ...base, expMonth: 10, expYear: 2026 }, "2026-11-13").expired, true);
  assert.equal(cardView({ ...base, expMonth: 11, expYear: 2026 }, "2026-11-13").expired, false, "vale até o fim do mês de validade");
  const bad = cardView({ ...base, lastAttempt: { attempt: 2, outcome: "recusada", at: "x" } });
  assert.match(bad.problem, /2 de 3.*recusou.*troque o cartão/);
  const ok = cardView({ ...base, lastAttempt: { attempt: 1, outcome: "aprovada", at: "x" } });
  assert.equal(ok.problem, null); assert.match(ok.lastText, /aprovada/);
  assert.equal(cardView({ ...base, lastAttempt: { attempt: 1, outcome: "estranho", at: "x" } }).problem, null);
  assert.equal(cardView({ ...base, brand: "<script>" }).title, "Cartão final 4242", "marca desconhecida nunca vai para a tela como veio");
});

test("texto da autorização de cobrança automática: plano, valor, periodicidade e cancelamento; sem plano usa texto genérico", async () => {
  const { authorizationText } = await import("../src/lib/platformBillingCore.js");
  const a = authorizationText({ planName: "Profissional", amountCents: 17990 });
  assert.equal(a.period, "mensal");
  assert.equal(a.amountCents, 17990);
  assert.equal(a.planKey, "profissional");
  assert.match(a.text, /Termos de Uso do Ilê Conecta/);
  assert.match(a.text, /R\$\s?179,90/);
  assert.match(a.text, /plano Profissional/);
  assert.match(a.text, /a cada mês/);
  assert.match(a.text, /até que eu solicite o cancelamento/);
  assert.ok(a.text.length >= 20 && a.text.length <= 1500);
  for (const bad of [{}, undefined, { planName: "", amountCents: 100 }, { planName: "X", amountCents: 0 }, { planName: "X", amountCents: 12.5 }, { planName: "X", amountCents: null }]) {
    const g = authorizationText(bad);
    assert.equal(g.amountCents, null);
    assert.equal(g.planKey, null);
    assert.match(g.text, /mensalidade do plano e das vagas extras/);
    assert.ok(g.text.length >= 20 && g.text.length <= 1500);
  }
});

test("reembolso do plano: leitura defensiva e texto da oferta", async () => {
  const { readPlanRefund, planRefundText } = await import("../src/lib/aiCreditsCore.js");
  assert.equal(readPlanRefund(null), null);
  assert.equal(readPlanRefund({ has_house: false }), null);
  const p = readPlanRefund({ has_house: true, eligible: true, cancelled: false, charge_id: "c1", amount_cents: 17990, deadline: "2026-11-20T12:00:00Z", window_days: 7, history: [{ at: "x", status: "falhou", amount_cents: 17990 }, { at: "y", status: "?" }] });
  assert.equal(p.eligible, true);
  assert.equal(p.history[0].status, "falhou");
  assert.equal(p.history[1].status, "pendente");
  assert.equal(readPlanRefund({ has_house: true, eligible: true, charge_id: null, amount_cents: 100 }).eligible, false);
  assert.equal(readPlanRefund({ has_house: true, eligible: true, charge_id: "c", amount_cents: 0 }).eligible, false);
  const t = planRefundText(p, Date.parse("2026-11-17T12:00:00Z"));
  assert.equal(t.money, "R$ 179,90");
  assert.match(t.line, /integral/);
  assert.match(t.line, /Faltam 3 dias/);
});
