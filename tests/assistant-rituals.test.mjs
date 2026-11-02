import test from "node:test";
import assert from "node:assert/strict";
import { brtDateTime, buildSystemPrompt, deliveryLabel, ritualModeLabel, serviceKindLabel } from "../supabase/functions/assistant-chat/logic.js";

test("rótulos de serviço e ritual", () => {
  assert.equal(serviceKindLabel("outro", " Benzimento "), "Benzimento");
  assert.equal(serviceKindLabel("cartas"), "cartas");
  assert.equal(deliveryLabel("sigilo"), "sigilo");
  assert.equal(ritualModeLabel("distancia"), "transmissão (à distância)");
  assert.equal(brtDateTime("2026-11-14T22:30:00Z"), "2026-11-14 19:30 (Brasília)");
});

test("prompt informa vagas restantes, forma e campos do ritual", () => {
  const p = buildSystemPrompt({
    house: { name: "Casa", category: "Umbanda" },
    assistant: { display_name: "Ana" },
    services: [{ kind: "outro", custom_kind: "Benzimento", delivery: "sigilo", title: "Benzimento", price_cents: 10000 }],
    events: [{ title: "Amor", price_cents: 19900, mode: "distancia", starts_at: "2026-11-14T22:30:00Z", seats_left: 12, intake_fields: [{ label: "Nome completo" }] }],
    plan: "maximo",
  });
  assert.match(p, /\[Benzimento, sigilo\]/);
  assert.match(p, /12 vagas restantes/);
  assert.match(p, /pede do participante: Nome completo/);
  assert.match(p, /Reservar vaga/);
});

test("botão de pagamento no chat: marcador [[PAGAR]] vira ação e nunca chega ao cliente", async () => {
  const { extractCheckout, resolveCheckout, finalizeReply } = await import("../supabase/functions/assistant-chat/logic.js");
  const ex = extractCheckout("O valor é R$ 80,00. A vaga fica segurada por 15 minutos. [[PAGAR: Gira de Abertura de Caminhos]]");
  assert.equal(ex.found, true);
  assert.equal(ex.title, "Gira de Abertura de Caminhos");
  assert.ok(!ex.text.includes("[["));
  assert.equal(extractCheckout("sem marcador").found, false);

  const fin = finalizeReply("Combinado! [[PAGAR: Gira de Abertura de Caminhos]]", "quero participar");
  assert.equal(fin.checkout, "Gira de Abertura de Caminhos");
  assert.ok(!fin.text.includes("PAGAR"));
  // Passando para a casa, não há botão.
  const h = finalizeReply("A casa responde. [[CASA: x]] [[PAGAR: Gira]]", "oi");
  assert.equal(h.checkout, undefined);

  const events = [{ id: "e1", title: "Gira de Abertura de Caminhos", seats_left: 3 }, { id: "e2", title: "Lotada", seats_left: 0 }];
  const services = [
    { id: "s1", title: "Cartas à distância", delivery: "transmissao", bookable: false },
    { id: "s2", title: "Consulta na casa", delivery: "presencial", bookable: false },
  ];
  assert.deepEqual(resolveCheckout("gira de abertura de caminhos", { events, services }), { target: "ritual", id: "e1" });
  assert.equal(resolveCheckout("Lotada", { events, services, selling: true }), null);
  assert.equal(resolveCheckout("Cartas à distância", { events, services, selling: false }), null);
  assert.deepEqual(resolveCheckout("Cartas a distancia", { events, services, selling: true }), { target: "service", id: "s1" });
  assert.equal(resolveCheckout("Consulta na casa", { events, services, selling: true }), null);
  assert.equal(resolveCheckout("", { events, services, selling: true }), null);
});
