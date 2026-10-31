import test from "node:test";
import assert from "node:assert/strict";
import { isFeatureOn, sanitizeConfig } from "../src/lib/platformConfigCore.js";
import { KINDS, VISIBILITY, kindDefaultVisibility, SUGGESTIONS, daysUntil, formatDay, nextOccurrence, parseDate, suggestionsFor, traditionalDates, upcoming, whenLabel, todayLocal } from "../src/lib/calendarCore.js";

test("datas inválidas são recusadas", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("2026-04-31"), null);
  assert.equal(parseDate("26-1-1"), null);
  assert.deepEqual(parseDate("2028-02-29"), { y: 2028, m: 2, d: 29 });
});

test("data anual: hoje conta, passada vai para o ano seguinte", () => {
  const it = { date: "2020-02-02", yearly: true };
  assert.equal(nextOccurrence(it, "2026-02-02"), "2026-02-02");
  assert.equal(nextOccurrence(it, "2026-02-03"), "2027-02-02");
  assert.equal(nextOccurrence(it, "2026-12-31"), "2027-02-02");
});

test("29 de fevereiro cai em 28 nos anos comuns", () => {
  const it = { date: "2024-02-29", yearly: true };
  assert.equal(nextOccurrence(it, "2026-01-10"), "2026-02-28");
  assert.equal(nextOccurrence(it, "2027-03-01"), "2028-02-29");
});

test("data única: futura vale, passada some", () => {
  assert.equal(nextOccurrence({ date: "2026-11-20", yearly: false }, "2026-10-31"), "2026-11-20");
  assert.equal(nextOccurrence({ date: "2026-10-30", yearly: false }, "2026-10-31"), null);
});

test("dias até, rótulos e formato", () => {
  assert.equal(daysUntil("2026-11-02", "2026-10-31"), 2);
  assert.equal(whenLabel(0), "hoje");
  assert.equal(whenLabel(1), "amanhã");
  assert.equal(whenLabel(5), "em 5 dias");
  assert.equal(formatDay("2026-02-02"), "2 de fevereiro");
  assert.equal(formatDay("2026-09-27", true), "27 de setembro de 2026");
});

test("ordena pela próxima ocorrência e deixa as encerradas por último", () => {
  const items = [
    { title: "C", date: "2026-01-01", yearly: false },
    { title: "B", date: "2020-12-08", yearly: true },
    { title: "A", date: "2020-11-05", yearly: true },
  ];
  assert.deepEqual(upcoming(items, "2026-10-31").map((i) => i.title), ["A", "B", "C"]);
});

test("sugestões: Quimbanda não tem; todas as datas são válidas", () => {
  assert.equal(suggestionsFor("Quimbanda").length, 0);
  assert.ok(suggestionsFor("Umbanda").length > 0 && suggestionsFor("Candomblé").length > 0);
  for (const s of SUGGESTIONS) assert.ok(parseDate(`2024-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`), s.key);
});

test("datas tradicionais: lista única, sem repetir as já cadastradas", () => {
  const all = traditionalDates();
  assert.equal(all.length, SUGGESTIONS.length);
  assert.ok(!traditionalDates([all[0].title]).some((x) => x.title === all[0].title));
  assert.equal(traditionalDates([], 3).length, 3);
});

test("hoje local sai no formato AAAA-MM-DD", () => {
  assert.equal(todayLocal(new Date(2026, 9, 31)), "2026-10-31");
});

test("sugestões já cadastradas não se repetem e respeitam o limite", () => {
  const all = suggestionsFor("Umbanda");
  assert.ok(all.length <= 6);
  const rest = suggestionsFor("Umbanda", [all[0].title]);
  assert.ok(!rest.some((x) => x.title === all[0].title));
  assert.equal(suggestionsFor("Umbanda", [], 2).length, 2);
});

test("tipos: obrigação nasce só interna; celebração e gira nascem abertas; a casa pode mudar tudo", () => {
  assert.equal(KINDS.length, 4);
  assert.equal(VISIBILITY.length, 4);
  assert.deepEqual(kindDefaultVisibility("obrigacao"), { vis_public: false, vis_followers: false, vis_house: true, vis_assistant: false });
  assert.equal(kindDefaultVisibility("celebracao").vis_public, true);
  assert.equal(kindDefaultVisibility("gira").vis_assistant, true);
  assert.equal(kindDefaultVisibility("desconhecido").vis_public, false);
  const v = kindDefaultVisibility("gira");
  v.vis_public = false; // copia: não altera o padrão
  assert.equal(kindDefaultVisibility("gira").vis_public, true);
});

test("calendário religioso: desligado por padrão e só liga com 'Ligado para todos'", () => {
  const d = sanitizeConfig({});
  assert.equal(d.features.calendar.state, "off");
  assert.equal(isFeatureOn(d, "calendar", "casa1"), false);
  assert.equal(isFeatureOn(sanitizeConfig({ features: { calendar: { state: "on" } } }), "calendar"), true);
});
