import test from "node:test";
import assert from "node:assert/strict";
import { readSeatStatus, keepOptions, canBuySeat, dateBR } from "../src/lib/seatsCore.js";

const raw = { has_house: true, subscribed: true, plan: "maximo", included: 1, extra: 3, in_use: 2, quote: { amount_cents: 1995, monthly_cents: 3990, days_left: 15, days_total: 30, cycle_end: "2026-12-01" }, blocked: null, release_to: null, release_on: null };

test("lê o estado do banco", () => {
  const st = readSeatStatus(raw);
  assert.deepEqual(st.quote, { amountCents: 1995, monthlyCents: 3990, daysLeft: 15, daysTotal: 30, cycleEnd: "2026-12-01" });
  assert.equal(st.extra, 3);
  assert.equal(canBuySeat(st), true);
  assert.equal(dateBR("2026-12-01"), "01/12/2026");
});

test("lixo vira estado seguro: sem casa, sem assinatura, sem compra", () => {
  for (const bad of [null, undefined, "x", 5, [], {}]) {
    const st = readSeatStatus(bad);
    assert.equal(st.hasHouse, false);
    assert.equal(canBuySeat(st), false);
    assert.equal(st.quote, null);
  }
});

test("valores inválidos não viram cotação nem datas", () => {
  const st = readSeatStatus({ ...raw, quote: { amount_cents: -5, monthly_cents: "x" }, release_on: "ontem", extra: 2.5, in_use: "3" });
  assert.equal(st.quote, null);
  assert.equal(st.releaseOn, null);
  assert.equal(st.extra, 0);
  assert.equal(st.inUse, 0);
  assert.equal(canBuySeat(st), false);
});

test("motivo de bloqueio impede a compra mesmo com cotação", () => {
  const st = readSeatStatus({ ...raw, blocked: "Há uma redução de vagas agendada." });
  assert.equal(canBuySeat(st), false);
  assert.equal(st.blocked, "Há uma redução de vagas agendada.");
});

test("casa sem assinatura nunca compra", () => {
  assert.equal(canBuySeat(readSeatStatus({ ...raw, subscribed: false })), false);
});

test("opções de redução respeitam a equipe em uso", () => {
  // incluída 1 + extras 3, em uso 2: pode manter 1 (1+1=2) ou 2; não pode manter 0
  assert.deepEqual(keepOptions(readSeatStatus(raw)), [1, 2]);
  assert.deepEqual(keepOptions(readSeatStatus({ ...raw, in_use: 0 })), [0, 1, 2]);
  assert.deepEqual(keepOptions(readSeatStatus({ ...raw, in_use: 4 })), [3].filter((k) => k < 3), "equipe cheia: nenhuma redução possível");
  assert.deepEqual(keepOptions(readSeatStatus({ ...raw, extra: 0 })), []);
});
