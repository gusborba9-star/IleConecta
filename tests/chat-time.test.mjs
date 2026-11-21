import test from "node:test";
import assert from "node:assert/strict";
import { clockTime, dayKey, dayLabel, decorateMessages } from "../src/lib/chatTimeCore.js";

const SP = "America/Sao_Paulo";
test("hora da bolha no fuso do aparelho, com dois dígitos", () => {
  assert.equal(clockTime("2026-09-17T13:30:00Z", SP), "10:30");
  assert.equal(clockTime("2026-09-17T03:05:00Z", SP), "00:05");
  assert.equal(clockTime("lixo", SP), "");
});
test("dia muda à meia-noite do fuso, não do UTC", () => {
  assert.equal(dayKey("2026-09-18T02:30:00Z", SP), "2026-09-17");
  assert.equal(dayKey("2026-09-18T03:30:00Z", SP), "2026-09-18");
});
test("rótulo do dia: Hoje, Ontem ou data por extenso", () => {
  const now = Date.parse("2026-11-21T15:00:00Z");
  assert.equal(dayLabel("2026-11-21T12:00:00Z", now, SP), "Hoje");
  assert.equal(dayLabel("2026-11-20T12:00:00Z", now, SP), "Ontem");
  assert.equal(dayLabel("2026-07-22T18:42:00Z", now, SP), "22 de julho de 2026");
  assert.equal(dayLabel("", now, SP), "");
});
test("agrupa por dia e por remetente", () => {
  const m = (id, at, from) => ({ id, createdAt: at, from });
  const out = decorateMessages([
    m(1, "2026-09-17T13:30:00Z", "a"), m(2, "2026-09-17T13:31:00Z", "a"), m(3, "2026-09-17T13:32:00Z", "b"), m(4, "2026-09-18T13:00:00Z", "b"),
  ], (x) => x.from, SP);
  assert.deepEqual(out.map((o) => [o.newDay, o.sameSenderAsPrev]), [[true, false], [false, true], [false, false], [true, false]]);
});
