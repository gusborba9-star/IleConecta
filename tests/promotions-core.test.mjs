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

test("editDaysDraft: campo de dias editável (apagar, digitar 20, limite 90)", async () => {
  const { editDaysDraft } = await import("../src/lib/promotionsCore.js");
  assert.deepEqual(editDaysDraft("", 90), { text: "", days: null });
  assert.deepEqual(editDaysDraft("2", 90), { text: "2", days: 2 });
  assert.deepEqual(editDaysDraft("20", 90), { text: "20", days: 20 });
  assert.deepEqual(editDaysDraft("120", 90), { text: "90", days: 90 });
  assert.deepEqual(editDaysDraft("0", 90), { text: "0", days: null });
  assert.deepEqual(editDaysDraft("05", 90), { text: "5", days: 5 });
  assert.deepEqual(editDaysDraft("a1b", 90), { text: "1", days: 1 });
  assert.deepEqual(editDaysDraft("50", 30), { text: "30", days: 30 });
});

test("brStates: nome ou sigla em qualquer grafia vira a sigla; lista com 27 estados", async () => {
  const { BR_STATES, ufFromText } = await import("../src/lib/brStates.js");
  assert.equal(BR_STATES.length, 27);
  assert.equal(new Set(BR_STATES.map((s) => s.uf)).size, 27);
  for (const s of BR_STATES) assert.equal(ufFromText(s.uf), s.uf);
  assert.equal(ufFromText("Río grande do Sul"), "RS");
  assert.equal(ufFromText("rio grande do norte"), "RN");
  assert.equal(ufFromText("Brasília"), "DF");
  assert.equal(ufFromText("Mato Grosso do Sul"), "MS");
  assert.equal(ufFromText("Mato Grosso"), "MT");
  assert.equal(ufFromText("RI"), "");
  assert.equal(ufFromText(null), "");
});

test("rankFeed: destaque nas primeiras posições, impulsionadas intercaladas, sem repetir", async () => {
  const { rankFeed } = await import("../src/lib/promotionsCore.js");
  const posts = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, houseId: `h${i % 4}`, kind: i === 5 ? "story" : "geral" }));
  const out = rankFeed(posts, { highlightOwners: ["h3", "h1"], boostedPostIds: ["p9", "p7", "inexistente"] });
  assert.equal(out.length, posts.length, "nenhuma publicação some nem se repete");
  assert.equal(new Set(out.map((x) => x.post.id)).size, posts.length);
  assert.deepEqual(out.slice(0, 2).map((x) => [x.post.id, x.tag]), [["p3", "destaque"], ["p1", "destaque"]], "mais recente de cada casa em destaque");
  assert.equal(out.filter((x) => x.tag === "promovido").length, 2);
  assert.ok(out.findIndex((x) => x.tag === "promovido") >= 3, "promovida entra depois do bloco de destaque");
  // momento (story) nunca é fixado como destaque
  const s = rankFeed([{ id: "s", houseId: "h9", kind: "story" }, { id: "x", houseId: "h9", kind: "geral" }], { highlightOwners: ["h9"] });
  assert.equal(s[0].post.id, "x");
  // no máximo 3 em destaque e 3 impulsionadas
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, houseId: `o${i}`, kind: "geral" }));
  const m = rankFeed(many, { highlightOwners: many.map((x) => x.houseId).slice(0, 8), boostedPostIds: many.map((x) => x.id).slice(10, 18) });
  assert.equal(m.filter((x) => x.tag === "destaque").length, 3);
  assert.equal(m.filter((x) => x.tag === "promovido").length, 3);
  // sem promoção: ordem original
  assert.deepEqual(rankFeed(posts).map((x) => x.post.id), posts.map((x) => x.id));
  assert.deepEqual(rankFeed(null), []);
});

test("resultados por compra e nome da publicação impulsionada", async () => {
  const { resultsLine, promoName, readMyPromotions } = await import("../src/lib/promotionsCore.js");
  assert.match(resultsLine({ views: 0, opens: 0 }), /Ainda sem resultados/);
  assert.equal(resultsLine({ views: 1, opens: 1 }), "1 visualização · 1 abertura");
  assert.equal(resultsLine({ views: 12, opens: 3 }), "12 visualizações · 3 aberturas");
  assert.equal(resultsLine({ views: 12, opens: 3 }, { chats: 2, checkouts: 1, payments: 1 }), "12 visualizações · 3 aberturas · conversões atribuídas: 2 conversas, 1 pedido ou reserva, 1 pago");
  assert.equal(resultsLine({ views: 12, opens: 3 }, { chats: 0, checkouts: 0, payments: 0 }), "12 visualizações · 3 aberturas");
  const { readFunnel } = await import("../src/lib/promotionsCore.js");
  assert.deepEqual(readFunnel([{ id: "a", chats: 2, checkouts: "1", payments: null }, { id: 5 }, null]), { a: { chats: 2, checkouts: 1, payments: 0 } });
  assert.deepEqual(readFunnel("x"), {});
  assert.match(resultsLine({}), /Ainda sem resultados/);
  assert.equal(promoName({ kind: "boost", scope: "cidade", itemType: "post", title: "Oi" }), 'Impulso da publicação "Oi" · Cidade');
  const r = readMyPromotions({ has_house: true, items: [{ id: "a", kind: "boost", scope: "cidade", status: "ativa", views: "7", opens: 2 }, { id: "b", kind: "boost", scope: "cidade", status: "ativa" }] });
  assert.deepEqual(r.items.map((i) => [i.views, i.opens]), [[7, 2], [0, 0]]);
});
