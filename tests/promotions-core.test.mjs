import test from "node:test";
import assert from "node:assert/strict";
import { readMyPromotions, readAvailability, endsLabel, countdownText, promoLine, promoRefundText, promoName } from "../src/lib/promotionsCore.js";

test("leitura das compras ignora lixo e normaliza campos", () => {
  assert.deepEqual(readMyPromotions(null), { hasHouse: false, items: [] });
  const r = readMyPromotions({ has_house: true, items: [null, { id: "a", kind: "x", scope: "cidade" }, { id: "b", kind: "boost", scope: "mundo" },
    { id: "c", kind: "boost", scope: "cidade", title: "Amor", days: 10, status: "ativa", running: true, days_left: "9", refund_cents: 15920, refund_days: 8, ends_at: "2026-11-25T01:03:00Z" }] });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].daysLeft, 9);
  assert.equal(r.items[0].refundCents, 15920);
  assert.equal(r.items[0].title, "Amor");
});
test("vagas: sem dados vira alcance cheio de zeros, nunca undefined", () => {
  const a = readAvailability(undefined);
  for (const k of ["cidade", "estado", "pais"]) assert.deepEqual(a.scopes[k], { limit: 0, taken: 0, full: false, mine: false, waiting: false, located: true });
  assert.equal(readAvailability({ has_house: true, scopes: { cidade: { limit: 3, taken: 3, full: true } } }).scopes.cidade.full, true);
});
test("fim exato no horário de Brasília e contador", () => {
  assert.equal(endsLabel("2026-11-15T01:03:00Z"), "14/11 às 22:03");
  assert.equal(endsLabel("lixo"), "");
  const now = Date.parse("2026-11-14T22:03:00Z");
  assert.equal(countdownText("2026-11-17T02:03:00Z", now), "2 d 4 h");
  assert.equal(countdownText("2026-11-14T27:00:00Z", now), "");
  assert.equal(countdownText("2026-11-15T03:15:00Z", now), "5 h 12 min");
  assert.equal(countdownText("2026-11-14T22:08:00Z", now), "5 min");
  assert.equal(countdownText("2026-11-14T22:03:30Z", now), "menos de 1 min");
  assert.equal(countdownText("2026-11-14T22:00:00Z", now), "encerrado");
});
test("frase do card: pausa, fila, ativa e último dia", () => {
  const base = { id: "1", kind: "highlight", scope: "cidade", itemType: null, itemId: null, title: null, days: 3, status: "ativa", chargeId: null, paidCents: 1, startsAt: "2026-11-14T22:03:00Z", endsAt: "2026-11-17T22:03:00Z", running: true, queued: false, paused: false, daysLeft: 3, daysUsed: 1, refundCents: null, refundDays: null, refundDeadline: null };
  const now = Date.parse("2026-11-14T23:03:00Z");
  assert.match(promoLine(base, now), /^Termina em 17\/11 às 19:03 \(2 d 23 h\) · 3 dias restantes$/);
  assert.match(promoLine({ ...base, daysLeft: 1 }, now), /último dia/);
  assert.match(promoLine({ ...base, paused: true }, now), /Pausado/);
  assert.match(promoLine({ ...base, running: false, queued: true }, now), /Na fila/);
  assert.equal(promoLine({ ...base, status: "reembolsada", running: false }, now), "Reembolsado.");
});
test("reembolso só como texto de pedidos e nome do item", () => {
  const i = { kind: "boost", scope: "estado", title: "Amor", refundCents: 8000, refundDays: 8 };
  assert.equal(promoRefundText(i, (c) => `R$ ${(c / 100).toFixed(2)}`), "8 dias que ainda não começaram: R$ 80.00");
  assert.equal(promoRefundText({ ...i, refundCents: null }, String), "");
  assert.equal(promoName(i), "Impulso de Amor · Estado");
  assert.equal(promoName({ kind: "boost", scope: "pais", title: null }), "Impulso de item removido · País");
});
