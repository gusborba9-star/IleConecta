// Tela única de conta bloqueada/inativa e cancelamento: leitura defensiva do banco e textos.
import test from "node:test";
import assert from "node:assert/strict";
import { brDate, cancelChoices, cancelDoneText, isLockedOpenPath, lockCopy, readCancelStatus, readGate } from "../src/lib/accountGateCore.js";

test("estado da conta: qualquer coisa que não seja bloqueada/inativa é ok (ninguém fica preso por lixo)", () => {
  for (const raw of [null, undefined, "x", 3, {}, { state: "ok" }, { state: "BLOQUEADA" }, { state: "qualquer" }, []]) assert.equal(readGate(raw).state, "ok");
  assert.equal(readGate({ state: "bloqueada", role: "dono", house_id: "h1", house_name: "Casa" }).state, "bloqueada");
  assert.deepEqual(readGate({ state: "inativa", role: "equipe", house_id: "h1", house_name: "Casa X" }), { state: "inativa", role: "equipe", houseId: "h1", houseName: "Casa X" });
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
  assert.deepEqual(s, { canCancel: true, reason: null, scheduled: false, cancelAt: null, nextRenewal: "2026-11-19" });
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
