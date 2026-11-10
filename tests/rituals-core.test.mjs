import test from "node:test";
import assert from "node:assert/strict";
import { fromIsoToBrt, grossCents, normalizeFields, seatsLeft, seatsState, toStartsAtIso, validateAnswers, validateRitual } from "../src/lib/ritualsCore.js";

const now = new Date("2026-10-26T12:00:00Z");
const ok = { title: " Ritual de Axé ", description: "Ritual coletivo de limpeza e proteção da casa.", priceText: "199,00", seatsText: "300", mode: "distancia", date: "2026-11-14", time: "19:30", streamUrl: "", fields: [{ label: "Nome completo", required: true }, { label: "Intenção" }] };

test("vagas: restante, estado e receita bruta", () => {
  assert.equal(seatsLeft(300, 287), 13);
  assert.equal(seatsLeft(10, 12), 0);
  assert.equal(seatsState(300, 300), "esgotado");
  assert.equal(seatsState(300, 287), "ultimas");
  assert.equal(seatsState(300, 10), "abertas");
  assert.equal(grossCents(19900, 287), 5711300);
});

test("data e hora no fuso de Brasília", () => {
  assert.equal(toStartsAtIso("2026-11-14", "19:30"), "2026-11-14T22:30:00.000Z");
  assert.deepEqual(fromIsoToBrt("2026-11-14T22:30:00.000Z"), { date: "2026-11-14", time: "19:30" });
  assert.deepEqual(fromIsoToBrt("2026-11-15T01:10:00.000Z"), { date: "2026-11-14", time: "22:10" });
  assert.equal(toStartsAtIso("14/11/2026", "19:30"), null);
  assert.equal(toStartsAtIso("2026-13-40", "19:30"), null);
});

test("campos: normaliza, remove vazios, ids únicos e limite de 8", () => {
  const r = normalizeFields([{ label: "Nome completo" }, { label: "Nome completo" }, { label: "x" }, { label: "Data de nascimento", required: 1 }]);
  assert.deepEqual(r.map((f) => f.id), ["nome_completo", "nome_completo_2", "data_de_nascimento"]);
  assert.equal(r[2].required, true);
  assert.equal(normalizeFields(Array.from({ length: 12 }, (_, i) => ({ label: `Campo ${i}` }))).length, 8);
  assert.deepEqual(normalizeFields(null), []);
});

test("ritual válido devolve valor limpo", () => {
  const r = validateRitual(ok, now);
  assert.equal(r.ok, true);
  assert.equal(r.value.title, "Ritual de Axé");
  assert.equal(r.value.price_cents, 19900);
  assert.equal(r.value.seats_total, 300);
  assert.equal(r.value.starts_at, "2026-11-14T22:30:00.000Z");
  assert.equal(r.value.stream_url, null);
  assert.equal(r.value.intake_fields.length, 2);
});

test("ritual inválido: erros por campo", () => {
  const r = validateRitual({ ...ok, title: "a", priceText: "0", seatsText: "0", mode: "", date: "2026-10-01", streamUrl: "http://x" }, now);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["mode", "price", "seats", "streamUrl", "title", "when"]);
  assert.equal(validateRitual({ ...ok, seatsText: "5001" }, now).ok, false);
  assert.equal(validateRitual({ ...ok, seatsText: "2,5" }, now).ok, false);
  assert.equal(validateRitual({ ...ok, streamUrl: "https://meet.example.com/abc" }, now).value.stream_url, "https://meet.example.com/abc");
});

test("respostas do participante", () => {
  const fields = normalizeFields(ok.fields);
  assert.equal(validateAnswers(fields, { nome_completo: "  " }).ok, false);
  const r = validateAnswers(fields, { nome_completo: " Maria ", intencao: "paz", extra: "lixo" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { nome_completo: "Maria", intencao: "paz" });
  assert.equal(validateAnswers([], {}).ok, true);
});
