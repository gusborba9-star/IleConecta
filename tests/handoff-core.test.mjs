import test from "node:test";
import assert from "node:assert/strict";
import { handoffView, shouldCallAssistant, toHandoff } from "../src/lib/handoffCore.js";

test("toHandoff: estados válidos e ativos", () => {
  assert.deepEqual(toHandoff({ state: "humano", active: true, handler_name: " Ana " }), { state: "humano", active: true, handlerName: "Ana" });
  assert.deepEqual(toHandoff({ state: "pendente", active: true, handler_name: null }), { state: "pendente", active: true, handlerName: null });
});
test("toHandoff: expirado, desconhecido ou lixo vira automação (nunca inventa atendimento humano)", () => {
  for (const row of [null, undefined, "x", 3, {}, { state: "humano", active: false }, { state: "outro", active: true }, { state: "humano", active: "true" }, { state: "automacao", active: true }]) {
    const h = toHandoff(row); assert.equal(h.state, "automacao"); assert.equal(h.active, false);
  }
});
test("handoffView: cliente não vê nada quando a assistente atende", () => {
  assert.equal(handoffView(null, "client"), null);
  assert.equal(handoffView(toHandoff({ state: "automacao", active: false }), "client"), null);
});
test("handoffView: casa vê 'assumir' quando pendente e 'devolver' quando humano", () => {
  const p = handoffView(toHandoff({ state: "pendente", active: true }), "house");
  assert.equal(p.action, "take"); assert.equal(p.tone, "alert"); assert.equal(p.label, "Assumir");
  const h = handoffView(toHandoff({ state: "humano", active: true, handler_name: "Ana" }), "house");
  assert.equal(h.action, "release"); assert.match(h.text, /Ana/); assert.match(h.label, /Devolver/);
  assert.equal(handoffView(toHandoff({ state: "humano", active: true }), "house").text.includes("undefined"), false);
});
test("handoffView: faixa permanente da casa com assistente (always) mostra 'Assumir' mesmo com a assistente atendendo", () => {
  const auto = toHandoff({ state: "automacao", active: false });
  assert.equal(handoffView(auto, "house"), null);
  const v = handoffView(auto, "house", { always: true });
  assert.equal(v.action, "take"); assert.equal(v.label, "Assumir");
  assert.equal(handoffView(null, "house", { always: true }).action, "take");
});
test("handoffView: pendente oferece também devolver direto à assistente (sem precisar assumir antes)", () => {
  const p = handoffView(toHandoff({ state: "pendente", active: true }), "house");
  assert.deepEqual(p.alt, { action: "release", label: "Devolver" });
  assert.equal(handoffView(toHandoff({ state: "humano", active: true }), "house").alt, undefined);
});
test("handoffView: textos curtos (faixa de uma linha)", () => {
  for (const viewer of ["house", "client"]) for (const state of ["pendente", "humano"]) {
    const v = handoffView(toHandoff({ state, active: true, handler_name: "Equipe Um" }), viewer, { always: true });
    assert.ok(v.text.length <= 50, `${viewer}/${state}: ${v.text.length}`);
  }
  assert.ok(handoffView(toHandoff(null), "house", { always: true }).text.length <= 50);
});
test("handoffView: cliente nunca recebe botão de ação", () => {
  for (const state of ["pendente", "humano"]) { const v = handoffView(toHandoff({ state, active: true }), "client", { always: true }); assert.equal(v.action, null); assert.equal(v.label, ""); }
});
test("shouldCallAssistant: só com casa offline, assistente disponível e sem humano atendendo", () => {
  const hum = toHandoff({ state: "humano", active: true });
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: null }), true);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: toHandoff(null) }), true);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: hum }), false);
  assert.equal(shouldCallAssistant({ houseOffline: false, hasAssistant: true, handoff: null }), false);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: false, handoff: null }), false);
});
test("shouldCallAssistant: conversa passada para a casa (pendente) não deixa o cliente sem resposta", () => {
  const pend = toHandoff({ state: "pendente", active: true });
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: pend }), true);
  assert.equal(shouldCallAssistant({ houseOffline: false, hasAssistant: true, handoff: pend }), true, "casa online mas ainda não respondeu");
  assert.equal(shouldCallAssistant({ houseOffline: false, hasAssistant: false, handoff: pend }), false, "sem assistente não chama");
  assert.equal(shouldCallAssistant({ houseOffline: false, hasAssistant: true, handoff: toHandoff({ state: "humano", active: true }) }), false, "a casa atendendo cala a assistente");
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: toHandoff({ state: "pendente", active: false }) }), true, "pendente vencido volta ao fluxo normal");
});
