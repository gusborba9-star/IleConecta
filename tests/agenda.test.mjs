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

test("serviço com agenda para qualquer tipo", () => {
  const base = { title: "Búzios", priceText: "200,00", delivery: "presencial", description: "Jogo completo com orientação." };
  const ok = validateService({ ...base, kind: "buzios", bookable: true, durationMin: 45 });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.bookable, true);
  assert.equal(ok.value.duration_min, 45);
  assert.equal(validateService({ ...base, kind: "limpeza", bookable: true }).ok, true); // 0073: agenda vale para qualquer tipo
  assert.equal(validateService({ ...base, kind: "buzios", bookable: true, durationMin: 5 }).ok, false);
  assert.equal(validateService({ ...base, kind: "buzios" }).value.duration_min, 30);
});

import { calendarOccurrences, conflictsForWindow, overlapsExistingWindow } from "../src/lib/agendaCore.js";

test("conflito: compromisso marcado dentro do horário semanal que a casa vai cadastrar", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  // terça 17/11/2026, 15:00–16:00 em Brasília
  const busy = [{ startsAt: brasiliaToIso("2026-11-17", "15:00"), endsAt: brasiliaToIso("2026-11-17", "16:00"), label: "Jogo de búzios com Maria" }];
  const hit = conflictsForWindow(2, "14:00", "18:00", busy, now);
  assert.equal(hit.length, 1);
  assert.match(hit[0].when, /ter, 17\/11 às 15:00/);
  assert.equal(conflictsForWindow(3, "14:00", "18:00", busy, now).length, 0, "outro dia da semana");
  assert.equal(conflictsForWindow(2, "16:00", "18:00", busy, now).length, 0, "termina exatamente quando o horário começa");
  assert.equal(conflictsForWindow(2, "09:00", "15:00", busy, now).length, 0, "o horário termina quando o compromisso começa");
  assert.equal(conflictsForWindow(2, "14:00", "18:00", busy, new Date("2026-11-18T12:00:00Z")).length, 0, "compromisso já passou");
});

test("calendário com hora vira compromisso de 2 h; sem hora, não", () => {
  const occ = calendarOccurrences([
    { title: "Gira", onDate: "2026-11-20", onTime: "20:00:00", yearly: false },
    { title: "Sem hora", onDate: "2026-11-21", onTime: null, yearly: false },
    { title: "Festa anual", onDate: "2020-11-25", onTime: "18:00", yearly: true },
  ], "2026-11-10", 30);
  assert.deepEqual(occ.map((o) => o.label), ["Gira", "Festa anual"]);
  assert.equal(new Date(occ[0].endsAt) - new Date(occ[0].startsAt), 2 * 3600000);
});

test("horário semanal que se sobrepõe a outro do mesmo dia", () => {
  const w = [{ weekday: 2, start: "09:00", end: "12:00" }];
  assert.equal(overlapsExistingWindow(2, "11:00", "14:00", w), true);
  assert.equal(overlapsExistingWindow(2, "12:00", "14:00", w), false);
  assert.equal(overlapsExistingWindow(3, "09:00", "12:00", w), false);
});
