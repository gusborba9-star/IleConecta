import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePercent, formatPercent, changedKinds, FEE_KINDS, MAX_FEE_BPS } from "../src/lib/feeRulesCore.js";
import { FEE_BPS } from "../src/lib/paymentsCore.js";

test("porcentagem digitada vira pontos-base", () => {
  assert.equal(parsePercent("15"), 1500);
  assert.equal(parsePercent("4"), 400);
  assert.equal(parsePercent("4,5"), 450);
  assert.equal(parsePercent("4.25"), 425);
  assert.equal(parsePercent(" 0 "), 0);
  assert.equal(parsePercent("30"), MAX_FEE_BPS);
});

test("entradas inválidas são recusadas", () => {
  for (const bad of ["", "abc", "-1", "30,01", "31", "100", "4,555", "1e2", "0x10", "4%", null, undefined, "15 20"]) assert.equal(parsePercent(bad), null, String(bad));
});

test("pontos-base viram texto e voltam sem perda", () => {
  assert.equal(formatPercent(1500), "15");
  assert.equal(formatPercent(425), "4,25");
  assert.equal(formatPercent(450), "4,5");
  assert.equal(formatPercent(5), "0,05");
  assert.equal(formatPercent(-1), "");
  assert.equal(formatPercent(1.5), "");
  for (let b = 0; b <= MAX_FEE_BPS; b += 5) assert.equal(parsePercent(formatPercent(b)), b);
});

test("resumo do que mudou", () => {
  const cur = { ritual: 1500, servico: 400, mensalidade: 400 };
  assert.deepEqual(changedKinds(cur, { ...cur }), []);
  assert.deepEqual(changedKinds(cur, { ...cur, servico: 500 }), ["servico"]);
  assert.equal(FEE_KINDS.length, 3);
});

test("o espelho do código bate com a semente da migration 0084 (anti-divergência)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0084_taxas_versionadas.sql", import.meta.url), "utf8");
  const m = sql.match(/values \('v2-2026-10', '(\{[^']+\})'::jsonb/);
  assert.ok(m, "semente não encontrada");
  const seed = JSON.parse(m[1]);
  assert.equal(FEE_BPS.ritual, seed.ritual);
  assert.equal(FEE_BPS.servico, seed.servico);
  assert.equal(FEE_BPS.servico_pix, seed.servico);
  assert.equal(FEE_BPS.mensalidade, seed.mensalidade);
});
