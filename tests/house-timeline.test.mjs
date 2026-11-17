import test from "node:test";
import assert from "node:assert/strict";
import { readHouseTimeline, mergeEvents, filterEvents, eventDetail, readHouseParam, EVENT_LABELS } from "../src/lib/houseTimelineCore.js";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ev = (o = {}) => ({ at: "2026-11-10T10:00:00Z", kind: "fatura_emitida", ref_id: U(5), title: "Vaga adicional", detail: "extra_seat", amount_cents: 3990, status: "aberta", ...o });
const raw = (o = {}) => ({ house: { id: U(1), name: "Casa Um", plan: "base", created_at: "2026-01-01T00:00:00Z" }, to_pay: null, events: [ev()], has_more: false, next_before: null, ...o });

test("lê o formato do banco", () => {
  const v = readHouseTimeline(raw());
  assert.equal(v.house.name, "Casa Um");
  assert.deepEqual(v.events[0], { at: "2026-11-10T10:00:00Z", kind: "fatura_emitida", refId: U(5), title: "Vaga adicional", detail: "extra_seat", amountCents: 3990, status: "aberta" });
  assert.equal(v.hasMore, false);
});
test("lixo vira vazio, nunca quebra", () => {
  for (const bad of [null, undefined, 5, "x", [], {}, { house: null }, { house: { id: "x" } }, { house: { id: "../x" } }]) { const v = readHouseTimeline(bad); assert.equal(v.house, null); assert.deepEqual(v.events, []); }
});
test("descarta evento malformado, tipo desconhecido, data inválida, id inválido", () => {
  const v = readHouseTimeline(raw({ events: [ev(), ev({ kind: "x" }), ev({ at: "ontem" }), ev({ ref_id: "nope" }), null, 3, ev({ kind: "plano", ref_id: U(6) })] }));
  assert.equal(v.events.length, 2);
});
test("valor negativo, fracionado ou texto some; texto hostil fica como texto", () => {
  const v = readHouseTimeline(raw({ events: [ev({ amount_cents: -5 }), ev({ ref_id: U(6), amount_cents: 1.5 }), ev({ ref_id: U(7), amount_cents: "9" }), ev({ ref_id: U(8), title: "<img src=x onerror=1>" })] }));
  assert.deepEqual(v.events.map((e) => e.amountCents), [null, null, null, 3990]);
  assert.equal(v.events[3].title, "<img src=x onerror=1>");
});
test("a pagar: total, vencida, desconto do Pix só se válido, menor que a fatura e com data", () => {
  const c = (o) => ({ id: U(9), kind: "extra_seat", description: "Vaga", amount_cents: 3990, due_date: "2026-12-17", status: "aberta", pix_discount_cents: 400, pix_discount_until: "2026-11-20", overdue: false, ...o });
  const v = readHouseTimeline(raw({ to_pay: { charges: [c(), c({ id: U(10), pix_discount_cents: 99999 }), c({ id: U(11), pix_discount_cents: -1 }), c({ id: U(12), pix_discount_until: null }), c({ id: U(13), due_date: "ontem" }), c({ id: U(14), amount_cents: -1 }), c({ id: U(15), overdue: true, pix_discount_cents: 0, pix_discount_until: null })] } }));
  assert.equal(v.toPay.count, 5);
  assert.equal(v.toPay.totalCents, 3990 * 5);
  assert.deepEqual(v.toPay.charges.map((x) => x.pixDiscountCents), [400, 0, 0, 0, 0]);
  assert.equal(v.toPay.charges[4].overdue, true);
});
test("paginação: só 'tem mais' com cursor válido", () => {
  assert.equal(readHouseTimeline(raw({ has_more: true, next_before: "2026-11-01T00:00:00Z" })).hasMore, true);
  assert.equal(readHouseTimeline(raw({ has_more: true, next_before: null })).hasMore, false);
  assert.equal(readHouseTimeline(raw({ has_more: true, next_before: "lixo" })).hasMore, false);
});
test("mergeEvents não repete e mantém a ordem; filterEvents por tipo", () => {
  const a = readHouseTimeline(raw({ events: [ev(), ev({ kind: "plano", ref_id: U(6), at: "2026-11-09T10:00:00Z" })] })).events;
  const b = readHouseTimeline(raw({ events: [ev({ kind: "plano", ref_id: U(6), at: "2026-11-09T10:00:00Z" }), ev({ kind: "suporte", ref_id: U(7), at: "2026-11-08T10:00:00Z" })] })).events;
  const m = mergeEvents(a, b);
  assert.deepEqual(m.map((e) => e.kind), ["fatura_emitida", "plano", "suporte"]);
  assert.equal(filterEvents(m, "plano").length, 1);
  assert.equal(filterEvents(m, "todos").length, 3);
  assert.equal(filterEvents(m).length, 3);
  // mesmo registro em dois momentos (emitida e paga) não colapsa
  assert.equal(mergeEvents([ev()], [ev({ kind: "fatura_paga" })]).length, 2);
});
test("eventDetail: motivo do plano em português; nada cru", () => {
  assert.equal(eventDetail({ kind: "plano", detail: "cancelou" }), "cancelou");
  assert.equal(eventDetail({ kind: "plano", detail: "subiu" }), "subiu de plano");
  assert.equal(eventDetail({ kind: "plano", detail: "<script>" }), "");
  assert.equal(eventDetail({ kind: "fatura_emitida", detail: "extra_seat" }), "");
  assert.equal(eventDetail({ kind: "fatura_paga", detail: "pix" }), "Pix");
});
test("readHouseParam: só UUID", () => {
  assert.equal(readHouseParam(U(1)), U(1));
  for (const bad of [null, "", "x", `${U(1)}'`, "../x", 5]) assert.equal(readHouseParam(bad), null);
});
test("todo tipo do banco tem rótulo", () => {
  for (const k of ["casa_criada", "plano", "fatura_emitida", "fatura_paga", "reembolso_plataforma", "reembolso_cliente", "moderacao", "moderacao_contestada", "suporte", "avaliacao_denunciada"]) assert.ok(EVENT_LABELS[k], k);
});
