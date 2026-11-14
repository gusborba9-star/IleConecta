// Tela única de conta bloqueada/inativa e cancelamento: leitura defensiva do banco e textos.
import test from "node:test";
import assert from "node:assert/strict";
import { brDate, brMoney, cancelChoices, cancelDebtNote, cancelDoneText, CANCEL_NOW_CONFIRM, isLockedOpenPath, lockCopy, readCancelStatus, readGate } from "../src/lib/accountGateCore.js";

test("estado da conta: qualquer coisa que não seja bloqueada/inativa é ok (ninguém fica preso por lixo)", () => {
  for (const raw of [null, undefined, "x", 3, {}, { state: "ok" }, { state: "BLOQUEADA" }, { state: "qualquer" }, []]) assert.equal(readGate(raw).state, "ok");
  assert.equal(readGate({ state: "bloqueada", role: "dono", house_id: "h1", house_name: "Casa" }).state, "bloqueada");
  assert.deepEqual(readGate({ state: "inativa", role: "equipe", house_id: "h1", house_name: "Casa X" }), { state: "inativa", role: "equipe", houseId: "h1", houseName: "Casa X", debtCents: 0 });
  assert.equal(readGate({ state: "bloqueada" }).role, "dono", "sem papel informado trata como dono (o servidor decide o que cada um pode)");
  assert.equal(readGate({ state: "ok", role: "dono", house_id: "h1" }).houseId, null);
});

test("tela única: bloqueada só fala em pagar; inativa só fala em escolher plano (não mistura)", () => {
  const b = lockCopy(readGate({ state: "bloqueada", role: "dono", house_name: "Casa" }));
  const i = lockCopy(readGate({ state: "inativa", role: "dono", house_name: "Casa" }));
  assert.equal(b.title, "Conta bloqueada");
  assert.equal(b.action, "desbloquear");
  assert.match(b.lead, /Pague a pendência/);
  assert.doesNotMatch(b.lead, /escolha um plano/i);
  assert.equal(i.title, "Conta inativa");
  assert.equal(i.action, "reativar");
  assert.match(i.lead, /escolha um plano/i);
  assert.doesNotMatch(i.lead, /pendência|falta de pagamento/i);
});

test("equipe: só é avisada, sem botão de pagar nem de reativar", () => {
  for (const state of ["bloqueada", "inativa"]) {
    const c = lockCopy(readGate({ state, role: "equipe", house_name: "Casa" }));
    assert.equal(c.action, null);
    assert.match(c.lead, /responsável/);
  }
});

test("rotas abertas na tela única: suporte, termos e retorno do pagamento; o resto não", () => {
  for (const p of ["/suporte", "/suporte/chamados", "/suporte/chamados/abc", "/termos", "/pagamento/retorno", "/pagamento/conta"]) assert.equal(isLockedOpenPath(p), true, p);
  for (const p of ["/", "/planos", "/painel/membros", "/admin", "/suportes", "/termosx", "/pagamentos", "/x/suporte", "", null, undefined]) assert.equal(isLockedOpenPath(p), false, String(p));
});

test("status do cancelamento: leitura defensiva", () => {
  assert.equal(readCancelStatus(null), null);
  assert.equal(readCancelStatus({ has_house: false }), null);
  assert.equal(readCancelStatus("x"), null);
  const s = readCancelStatus({ has_house: true, can_cancel: true, reason: null, scheduled: false, cancel_at: null, next_renewal: "2026-11-19" });
  assert.deepEqual(s, { canCancel: true, reason: null, scheduled: false, cancelAt: null, nextRenewal: "2026-11-19", debtCents: 0 });
  assert.equal(readCancelStatus({ has_house: true, can_cancel: "true" }).canCancel, false, "só true de verdade libera");
  assert.equal(readCancelStatus({ has_house: true, can_cancel: false, reason: "Há uma fatura em atraso." }).reason, "Há uma fatura em atraso.");
  assert.equal(readCancelStatus({ has_house: true, scheduled: true, cancel_at: "2026-11-19" }).scheduled, true);
});

test("datas do calendário não andam por causa do fuso", () => {
  assert.equal(brDate("2026-11-19"), "19/11/2026");
  assert.equal(brDate("2026-01-01"), "01/01/2026");
  assert.equal(brDate("2026-11-19T03:00:00.000Z"), "19/11/2026");
  assert.equal(brDate(null), "");
  assert.equal(brDate("lixo"), "");
});

test("as duas escolhas do cancelamento: vencimento (com a data) e agora (sem devolução)", () => {
  const [v, a] = cancelChoices({ nextRenewal: "2026-11-19" });
  assert.equal(v.mode, "vencimento");
  assert.match(v.text, /19\/11\/2026/);
  assert.match(v.text, /desfazer/);
  assert.equal(a.mode, "agora");
  assert.match(a.text, /sem devolução/);
  assert.match(cancelChoices(null)[0].text, /próximo vencimento/);
});

test("mensagem depois de cancelar", () => {
  assert.equal(cancelDoneText({ mode: "vencimento", cancelAt: "2026-11-19" }), "Cancelamento agendado para 19/11/2026.");
  assert.match(cancelDoneText({ mode: "agora" }), /inativa/);
  assert.match(cancelDoneText(null), /inativa/);
});

test("dinheiro: centavos viram reais, e lixo vira R$ 0,00", () => {
  assert.equal(brMoney(29990), "R$ 299,90");
  assert.equal(brMoney(5), "R$ 0,05");
  assert.equal(brMoney(100), "R$ 1,00");
  for (const v of [null, undefined, "x", -5, NaN, {}]) assert.equal(brMoney(v), "R$ 0,00");
});

test("conta inativa com fatura vencida: primeiro quitar, depois reativar", () => {
  const dono = lockCopy(readGate({ state: "inativa", role: "dono", house_name: "Casa", debt_cents: 29990 }));
  assert.equal(dono.action, "quitar");
  assert.match(dono.lead, /fatura vencida de R\$ 299,90/);
  assert.match(dono.lead, /Pague a fatura para poder reativar/);
  const sem = lockCopy(readGate({ state: "inativa", role: "dono", house_name: "Casa", debt_cents: 0 }));
  assert.equal(sem.action, "reativar");
  const equipe = lockCopy(readGate({ state: "inativa", role: "equipe", house_name: "Casa", debt_cents: 29990 }));
  assert.equal(equipe.action, null, "equipe só é avisada");
  assert.equal(readGate({ state: "bloqueada", role: "dono", debt_cents: 5000 }).debtCents, 5000);
  assert.equal(lockCopy(readGate({ state: "bloqueada", role: "dono", debt_cents: 5000 })).action, "desbloquear", "bloqueada por falta de pagamento segue só pagando a pendência");
  assert.equal(readGate({ state: "inativa", debt_cents: "lixo" }).debtCents, 0);
});

test("cancelar com fatura vencida: o aviso da dívida aparece antes e depois de confirmar", () => {
  const st = readCancelStatus({ has_house: true, can_cancel: true, debt_cents: 29990, next_renewal: "2026-11-19" });
  assert.equal(st.debtCents, 29990);
  assert.match(cancelDebtNote(st), /fatura vencida de R\$ 299,90 não some com o cancelamento/);
  assert.equal(cancelDebtNote(readCancelStatus({ has_house: true, can_cancel: true })), "");
  assert.equal(cancelDebtNote(null), "");
  assert.match(cancelDoneText({ mode: "agora", debtCents: 29990 }), /Assinatura cancelada\. A casa está inativa\. A fatura vencida de R\$ 299,90 continua em aberto\./);
  assert.equal(cancelDoneText({ mode: "agora" }), "Assinatura cancelada. A casa está inativa.");
  assert.match(cancelDoneText({ mode: "vencimento", cancelAt: "2026-11-19", debtCents: 100 }), /agendado para 19\/11\/2026\. A fatura vencida de R\$ 1,00/);
});

test("cancelar agora: texto da escolha e confirmação extra deixam claro que não há devolução dos dias restantes", () => {
  const agora = cancelChoices(null).find((c) => c.mode === "agora");
  assert.match(agora.text, /sem devolução dos dias restantes/);
  assert.match(CANCEL_NOW_CONFIRM, /cancelar imediatamente/);
  assert.match(CANCEL_NOW_CONFIRM, /não haverá reembolso dos dias restantes do ciclo já pago/);
});

import { readPlanRefund, RETURNING_REFUND_TEXT } from "../src/lib/aiCreditsCore.js";
test("reembolso do plano: conta reutilizada não é elegível e a mensagem é clara", () => {
  const p = readPlanRefund({ has_house: true, returning: true, eligible: false, charge_id: "c1", amount_cents: 29990, deadline: "2099-01-01T00:00:00Z", window_days: 7, history: [] });
  assert.equal(p.returning, true);
  assert.equal(p.eligible, false);
  assert.match(RETURNING_REFUND_TEXT, /Conta reutilizada/);
  assert.match(RETURNING_REFUND_TEXT, /não está incluído/);
  assert.equal(readPlanRefund({ has_house: true, eligible: false }).returning, false);
});
