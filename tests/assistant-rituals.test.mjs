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
