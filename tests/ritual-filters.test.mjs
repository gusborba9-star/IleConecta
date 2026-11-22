import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters, facets, startOfDay, whenRange, toParams, fromParams, splitBoosted, activeCount, tzOffsetMin } from "../src/lib/ritualFiltersCore.js";

// 22/11/2026 23:30 em Brasília (= 23/11 02:30 UTC): o "hoje" ainda é dia 22
const now = Date.UTC(2026, 10, 23, 2, 30);
const at = (d, h) => Date.UTC(2026, 10, d, h + 3); // hora de Brasília → UTC
const R = (id, o = {}) => ({ id, mode: "presencial", startsAt: new Date(at(25, 20)).toISOString(), priceCents: 5000, seatsTotal: 10, ownerId: "o1", houseVerified: false, ...o });

test("Brasília: deslocamento -180 e início do dia certo perto da meia-noite", () => {
  assert.equal(tzOffsetMin(now), -180);
  assert.equal(new Date(startOfDay(now)).toISOString(), "2026-11-22T03:00:00.000Z");
  assert.deepEqual(whenRange("hoje", now).map((x) => new Date(x).toISOString()), ["2026-11-22T03:00:00.000Z", "2026-11-23T03:00:00.000Z"]);
  assert.equal(new Date(whenRange("mes", now)[1]).toISOString(), "2026-12-01T03:00:00.000Z");
});
test("data: hoje (23h30 em Brasília) inclui 22/11 23h e exclui 23/11 00h30", () => {
  const a = R("a", { startsAt: new Date(at(22, 23)).toISOString() }), b = R("b", { startsAt: new Date(at(23, 0.5)).toISOString() });
  assert.deepEqual(applyFilters([a, b], { quando: "hoje" }, { now }).map((r) => r.id), ["a"]);
  assert.deepEqual(applyFilters([a, b], { quando: "7dias" }, { now }).map((r) => r.id), ["a", "b"]);
});
test("preço: limites das faixas", () => {
  const L = [0, 1, 5000, 5001, 15000, 15001].map((c) => R("p" + c, { priceCents: c }));
  const ids = (p) => applyFilters(L, { preco: p }).map((r) => r.id);
  assert.deepEqual(ids("gratis"), ["p0"]);
  assert.deepEqual(ids("ate50"), ["p1", "p5000"]);
  assert.deepEqual(ids("de50a150"), ["p5001", "p15000"]);
  assert.deepEqual(ids("acima150"), ["p15001"]);
});
test("modalidade: híbrido aparece nas duas; filtros de grupos diferentes se somam", () => {
  const L = [R("p", { mode: "presencial" }), R("d", { mode: "distancia", priceCents: 0 }), R("h", { mode: "hibrido" })];
  assert.deepEqual(applyFilters(L, { modo: "distancia" }).map((r) => r.id), ["d", "h"]);
  assert.deepEqual(applyFilters(L, { modo: "distancia", preco: "gratis" }).map((r) => r.id), ["d"]);
});
test("vaga: vaga desconhecida não entra; esgotado não entra", () => {
  const L = [R("a"), R("b"), R("c")];
  assert.deepEqual(applyFilters(L, { vaga: true }, { taken: { a: 3, b: 10 } }).map((r) => r.id), ["a"]);
});
test("verificada e nota", () => {
  const L = [R("a", { houseVerified: true, ownerId: "x" }), R("b", { ownerId: "y" })];
  assert.deepEqual(applyFilters(L, { verificada: true }).map((r) => r.id), ["a"]);
  assert.deepEqual(applyFilters(L, { nota: true }, { rating: (o) => (o === "y" ? 4.5 : 0) }).map((r) => r.id), ["b"]);
});
test("facetas: só aparece o que discrimina; contagem considera os outros filtros", () => {
  const L = [R("a"), R("b", { mode: "distancia", priceCents: 0 })];
  const f = facets(L, {}, { now, taken: { a: 0, b: 0 }, rating: () => 0 });
  const g = (id) => f.find((x) => x.id === id);
  assert.equal(g("modo").show, true);
  assert.equal(g("preco").show, true);
  assert.equal(g("verificada").show, false); // ninguém verificada: não discrimina
  assert.equal(g("nota").show, false);
  assert.equal(g("vaga").show, false); // todos com vaga: não discrimina
  assert.deepEqual(g("modo").options.map((o) => o.count), [1, 1]);
  const f2 = facets(L, { preco: "gratis" }, { now });
  assert.deepEqual(f2.find((x) => x.id === "modo").options.map((o) => o.count), [0, 1]);
  assert.equal(f2.find((x) => x.id === "preco").show, true); // ligado continua visível
});
test("facetas: 'Com vaga' só aparece com as vagas de todos conhecidas", () => {
  const L = [R("a"), R("b")];
  assert.equal(facets(L, {}, { now, taken: { a: 0 } }).find((x) => x.id === "vaga").show, false);
  assert.equal(facets(L, {}, { now, taken: { a: 0, b: 10 } }).find((x) => x.id === "vaga").show, true);
});
test("endereço: ida e volta; valor inválido é ignorado", () => {
  const f = { modo: "distancia", quando: "mes", preco: "gratis", vaga: true, verificada: false, nota: false };
  assert.deepEqual(fromParams(toParams(f)), f);
  assert.equal(fromParams(new URLSearchParams("modo=xx&preco=1")).modo, "");
  assert.equal(activeCount(f), 4);
});
test("impulsionados na frente, fora da contagem do orgânico", () => {
  const L = [R("a"), R("b"), R("c")];
  const { boosted, organic } = splitBoosted(L, new Set(["b"]));
  assert.deepEqual([boosted.length, organic.length], [1, 2]);
});
