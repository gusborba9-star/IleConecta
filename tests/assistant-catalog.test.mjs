import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, normalizeCatalog } from "../supabase/functions/assistant-chat/logic.js";

const base = {
  house: { name: "Casa Teste", category: "Umbanda" },
  assistant: { display_name: "Lara", enabled: true, business_hours: {} },
  services: [], events: [], plan: "maximo",
  now: new Date("2026-10-31T12:00:00Z"),
};

test("catálogo: valor só aparece quando a casa liberou", () => {
  const p = buildSystemPrompt({ ...base, catalog: [
    { name: "Jogo de búzios", price_cents: 20000, show_price: true, active: true },
    { name: "Limpeza espiritual", price_cents: 27700, show_price: false, active: true },
    { name: "Segurança", price_cents: null, show_price: true, active: true, description: "Proteção" },
  ] });
  assert.match(p, /CATÁLOGO INTERNO DA CASA \(privado/);
  assert.match(p, /Jogo de búzios — valor que você pode informar: R\$\s200,00/);
  assert.match(p, /Limpeza espiritual — valor: não informe/);
  assert.doesNotMatch(p, /277,00/);
  assert.match(p, /Segurança — valor: não informe.* — Proteção/);
});

test("catálogo: sem itens não cria a seção; inativos e inválidos saem", () => {
  assert.doesNotMatch(buildSystemPrompt({ ...base, catalog: [] }), /CATÁLOGO INTERNO DA CASA \(privado/);
  const n = normalizeCatalog([{ name: "x" }, { name: "Cartas", active: false }, { name: "Consulta", price_cents: 10000, show_price: true }, null]);
  assert.deepEqual(n.map((i) => i.name), ["Consulta"]);
  assert.equal(normalizeCatalog("lixo").length, 0);
});

test("prompt v2: fluxo, argumento da plataforma e híbrido", () => {
  const p = buildSystemPrompt({ ...base, catalog: [], services: [{ title: "Búzios", kind: "buzios", delivery: "hibrido", price_cents: 20000 }] });
  assert.match(p, /COMO ATENDER/);
  assert.match(p, /Pagar pela plataforma é mais seguro/);
  assert.match(p, /presencial ou à distância \(o cliente escolhe ao contratar\)/);
});

test("agenda: serviço com agenda mostra próximos horários e não permite a assistente agendar", () => {
  const p = buildSystemPrompt({ ...base, catalog: [], services: [
    { title: "Búzios", kind: "buzios", delivery: "hibrido", price_cents: 20000, bookable: true, duration_min: 30, next_slots: ["2026-11-03T12:00:00Z"] },
    { title: "Limpeza", kind: "limpeza", delivery: "transmissao", price_cents: 10000 },
  ] });
  assert.match(p, /Búzios.*COM AGENDA \(30 min.*próximos horários livres: 2026-11-03 09:00 \(Brasília\)/);
  assert.doesNotMatch(p, /Limpeza.*COM AGENDA/);
  assert.match(p, /Você nunca marca, agenda ou reserva horário por conta própria/);
});

test("fila de espera: ritual esgotado orienta a fila", () => {
  const p = buildSystemPrompt({ ...base, catalog: [], events: [{ title: "Prosperidade", price_cents: 19900, mode: "presencial", starts_at: "2026-11-20T22:00:00Z", seats_left: 0 }] });
  assert.match(p, /ESGOTADO \(o cliente pode entrar na fila de espera/);
});
