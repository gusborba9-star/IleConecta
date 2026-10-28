import test from "node:test";
import assert from "node:assert/strict";
import { formatCents, kindLabel, parsePriceToCents, validateService } from "../src/lib/servicesCore.js";

test("converte preços digitados em centavos", () => {
  assert.equal(parsePriceToCents("200"), 20000);
  assert.equal(parsePriceToCents("200,00"), 20000);
  assert.equal(parsePriceToCents("R$ 199,90"), 19990);
  assert.equal(parsePriceToCents("1.200,50"), 120050);
  assert.equal(parsePriceToCents("1.200"), 120000);
  assert.equal(parsePriceToCents("12.5"), 1250);
  assert.equal(parsePriceToCents("0,10"), 10);
});

test("rejeita preços inválidos, zero, negativos e absurdos", () => {
  for (const bad of ["", "abc", "0", "0,00", "-5", "1,2,3", "1,200.50", "100000,01", "10e3", null, undefined, 5]) {
    assert.equal(parsePriceToCents(bad), null, String(bad));
  }
  assert.equal(parsePriceToCents("100000"), 10000000);
});

test("formata em reais sem erro de ponto flutuante", () => {
  assert.equal(formatCents(19990).replace(/\s/g, " "), "R$ 199,90");
});

const ok = { kind: "buzios", customKind: "", title: "  Jogo de búzios ", description: " Consulta completa ", priceText: "200,00", delivery: "presencial" };

test("formulário válido devolve o valor limpo para gravar", () => {
  const r = validateService(ok);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { kind: "buzios", custom_kind: null, title: "Jogo de búzios", description: "Consulta completa", price_cents: 20000, delivery: "presencial", stages: 1 });
});

test("tipo Outro exige nome livre; os demais descartam o nome livre", () => {
  assert.equal(validateService({ ...ok, kind: "outro", customKind: "" }).errors.customKind !== undefined, true);
  const r = validateService({ ...ok, kind: "outro", customKind: "Benzimento" });
  assert.equal(r.ok, true);
  assert.equal(r.value.custom_kind, "Benzimento");
  assert.equal(validateService({ ...ok, customKind: "lixo" }).value.custom_kind, null);
  assert.equal(kindLabel("outro", "Benzimento"), "Benzimento");
  assert.equal(kindLabel("cartas"), "Cartas");
});

test("erros por campo", () => {
  const r = validateService({ kind: "", customKind: "", title: "a", description: "x".repeat(601), priceText: "0", delivery: "" });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["delivery", "description", "kind", "price", "title"]);
});

test("etapas do serviço: padrão 1, aceita de 1 a 4, recusa o resto", () => {
  assert.equal(validateService(ok).value.stages, 1);
  assert.equal(validateService({ ...ok, stages: 2 }).value.stages, 2);
  assert.equal(validateService({ ...ok, stages: "4" }).value.stages, 4);
  for (const bad of [0, 5, 1.5, "x"]) assert.equal(validateService({ ...ok, stages: bad }).errors.stages !== undefined, true);
});
