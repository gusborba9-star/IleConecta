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
test("handoffView: nada a mostrar quando a assistente atende", () => {
  assert.equal(handoffView(null, "house"), null);
  assert.equal(handoffView(toHandoff({ state: "automacao", active: false }), "client"), null);
});
test("handoffView: casa vê 'assumir' quando pendente e 'devolver' quando humano", () => {
  const p = handoffView(toHandoff({ state: "pendente", active: true }), "house");
  assert.equal(p.action, "take"); assert.equal(p.tone, "alert");
  const h = handoffView(toHandoff({ state: "humano", active: true, handler_name: "Ana" }), "house");
  assert.equal(h.action, "release"); assert.match(h.text, /Ana/);
  assert.equal(handoffView(toHandoff({ state: "humano", active: true }), "house").text.includes("undefined"), false);
});
test("handoffView: cliente nunca recebe botão de ação", () => {
  for (const state of ["pendente", "humano"]) assert.equal(handoffView(toHandoff({ state, active: true }), "client").action, null);
});
test("shouldCallAssistant: só com casa offline, assistente disponível e sem humano atendendo", () => {
  const hum = toHandoff({ state: "humano", active: true });
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: null }), true);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: toHandoff(null) }), true);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: hum }), false);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: true, handoff: toHandoff({ state: "pendente", active: true }) }), false);
  assert.equal(shouldCallAssistant({ houseOffline: false, hasAssistant: true, handoff: null }), false);
  assert.equal(shouldCallAssistant({ houseOffline: true, hasAssistant: false, handoff: null }), false);
});
