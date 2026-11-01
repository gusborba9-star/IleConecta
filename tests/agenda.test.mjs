import test from "node:test";
import assert from "node:assert/strict";
import { validateWindow, partsInBrasilia, formatSlot, groupSlots, brasiliaToIso } from "../src/lib/agendaCore.js";
import { validateService } from "../src/lib/servicesCore.js";

test("janela semanal", () => {
  assert.equal(validateWindow("09:00", "12:00"), null);
  assert.ok(validateWindow("12:00", "09:00"));
  assert.ok(validateWindow("9h", "12:00"));
});

test("horários em Brasília", () => {
  assert.deepEqual(partsInBrasilia("2026-11-03T12:00:00Z"), { day: "2026-11-03", time: "09:00" });
  assert.equal(formatSlot("2026-11-03T02:30:00Z"), "02/11 às 23:30");
  assert.equal(brasiliaToIso("2026-11-03", "09:00"), "2026-11-03T12:00:00.000Z");
});

test("agrupa horários por dia", () => {
  const g = groupSlots(["2026-11-03T13:00:00Z", "2026-11-03T12:00:00Z", "2026-11-04T12:00:00Z"]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].slots.map((s) => s.time), ["09:00", "10:00"]);
  assert.match(g[0].label, /^ter, 03\/11$/);
});

test("serviço com agenda só para búzios, cartas e consulta", () => {
  const base = { title: "Búzios", priceText: "200,00", delivery: "presencial", description: "Jogo completo com orientação." };
  const ok = validateService({ ...base, kind: "buzios", bookable: true, durationMin: 45 });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.bookable, true);
  assert.equal(ok.value.duration_min, 45);
  assert.equal(validateService({ ...base, kind: "limpeza", bookable: true }).ok, false);
  assert.equal(validateService({ ...base, kind: "buzios", bookable: true, durationMin: 5 }).ok, false);
  assert.equal(validateService({ ...base, kind: "buzios" }).value.duration_min, 30);
});
