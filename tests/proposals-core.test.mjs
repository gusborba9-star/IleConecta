import test from "node:test";
import assert from "node:assert/strict";
import { brasiliaToIso, proposalStatusText } from "../src/lib/proposalsCore.js";

test("dia e hora da casa viram o instante certo em Brasília (UTC-3)", () => {
  assert.equal(brasiliaToIso("2026-11-21", "16:00"), "2026-11-21T19:00:00.000Z");
  assert.equal(brasiliaToIso("2026-11-21", "23:30"), "2026-11-22T02:30:00.000Z");
  assert.equal(brasiliaToIso("2026-12-31", "21:00"), "2027-01-01T00:00:00.000Z");
});
test("entradas incompletas ou impossíveis são recusadas", () => {
  for (const [d, t] of [["", "16:00"], ["2026-11-21", ""], ["21/11/2026", "16:00"], ["2026-11-21", "4pm"], ["2026-02-30", "10:00"], ["2026-13-01", "10:00"], ["2026-11-21", "25:00"]])
    assert.equal(brasiliaToIso(d, t), null, `${d} ${t}`);
});
test("textos de estado do cartão", () => {
  assert.equal(proposalStatusText("aberta", false), "");
  assert.equal(proposalStatusText("paga", false), "Pago e confirmado");
  assert.match(proposalStatusText("indisponivel", false), /A casa foi avisada/);
  assert.equal(proposalStatusText("indisponivel", true), "Horário não está mais disponível");
  assert.equal(proposalStatusText("expirada", true), "Proposta expirada");
});
