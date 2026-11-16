// Pessoas da casa: leitura defensiva, textos, destinos e coerência com o SQL (0131).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEGMENTS, SEGMENT_LABELS, SEGMENT_HINTS, EVENT_LABELS, readHousePeople, readPersonTimeline, agoText, eventDetailText, eventTarget } from "../src/lib/housePeopleCore.js";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const person = (o = {}) => ({ person_id: U(1), name: "Ana", avatar_url: null, city: "Salvador", state: "BA", segments: ["seguidor", "cliente"], purchases: 2, spent_cents: 10000, first_at: "2026-10-01T10:00:00Z", last_at: "2026-11-10T10:00:00Z", ...o });
const raw = (items, o = {}) => ({ role: "titular", segment: "todos", total: items.length, counts: Object.fromEntries(SEGMENTS.map((s) => [s, 1])), items, ...o });

test("lê o formato do banco", () => {
  const v = readHousePeople(raw([person()]));
  assert.equal(v.role, "titular"); assert.equal(v.total, 1);
  assert.deepEqual(v.items[0], { personId: U(1), name: "Ana", avatarUrl: null, city: "Salvador", state: "BA", segments: ["seguidor", "cliente"], purchases: 2, spentCents: 10000, firstAt: "2026-10-01T10:00:00Z", lastAt: "2026-11-10T10:00:00Z" });
});

test("entrada ruim vira lista vazia, sem quebrar", () => {
  for (const bad of [null, undefined, 3, "x", [], {}, { items: "x" }, { items: [null, 3, "a"] }]) { const v = readHousePeople(bad); assert.equal(v.items.length, 0); assert.equal(v.total, 0); assert.equal(v.role, "titular"); }
  assert.equal(readPersonTimeline(null), null); assert.equal(readPersonTimeline({}), null); assert.equal(readPersonTimeline({ person: { person_id: "x" } }), null);
});

test("descarta pessoas sem UUID válido; corrige nome vazio, segmentos desconhecidos, valores negativos e datas ruins", () => {
  const v = readHousePeople(raw([person(), person({ person_id: "../x" }), person({ person_id: 7 }), person({ person_id: U(2), name: "  ", segments: ["cliente", "inventado", 3, "todos", "sumido"], spent_cents: -5, purchases: -1, last_at: "ontem", avatar_url: "javascript:alert(1)" }), null]));
  assert.equal(v.items.length, 2);
  const b = v.items[1];
  assert.equal(b.name, "Pessoa"); assert.deepEqual(b.segments, ["cliente", "sumido"]); assert.equal(b.spentCents, null); assert.equal(b.purchases, 0); assert.equal(b.lastAt, null); assert.equal(b.avatarUrl, null);
});

test("só aceita foto https; equipe nunca recebe valor: valor nulo é preservado como nulo", () => {
  assert.equal(readHousePeople(raw([person({ avatar_url: "https://x.com/a.png" })])).items[0].avatarUrl, "https://x.com/a.png");
  assert.equal(readHousePeople(raw([person({ avatar_url: "http://x.com/a.png" })])).items[0].avatarUrl, null);
  assert.equal(readHousePeople(raw([person({ spent_cents: null })], { role: "equipe" })).items[0].spentCents, null);
  assert.equal(readHousePeople(raw([], { role: "admin" })).role, "titular"); assert.equal(readHousePeople(raw([], { role: "equipe" })).role, "equipe");
});

test("contagens: só números inteiros não negativos; segmento inválido volta para 'todos'", () => {
  const v = readHousePeople(raw([], { counts: { todos: "5", seguidor: -1, cliente: 3.5, membro: 4 }, segment: "hack" }));
  assert.equal(v.counts.todos, 0); assert.equal(v.counts.seguidor, 0); assert.equal(v.counts.cliente, 0); assert.equal(v.counts.membro, 4); assert.equal(v.segment, "todos");
});

test("linha do tempo: tipos conhecidos, ordem do mais novo ao mais antigo, ids e datas validados", () => {
  const ev = (o) => ({ at: "2026-11-01T10:00:00Z", kind: "pedido", ref_id: U(5), title: "Trabalho", detail: "concluido", ...o });
  const t = readPersonTimeline({ role: "equipe", person: person(), events: [ev({ at: "2026-10-01T10:00:00Z", ref_id: U(6) }), ev(), ev({ kind: "inventado" }), ev({ at: "nunca" }), ev({ ref_id: "../x", at: "2026-11-05T10:00:00Z" }), ev({ title: "", kind: "seguiu", at: "2026-11-06T10:00:00Z" }), null, 3] });
  assert.equal(t.role, "equipe");
  assert.deepEqual(t.events.map((e) => e.at), ["2026-11-06T10:00:00Z", "2026-11-05T10:00:00Z", "2026-11-01T10:00:00Z", "2026-10-01T10:00:00Z"]);
  assert.equal(t.events[0].title, EVENT_LABELS.seguiu); assert.equal(t.events[1].refId, null);
});

test("agoText: hoje, ontem, dias, meses, anos e futuro; data ruim vira vazio", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  assert.equal(agoText("2026-11-16T08:00:00Z", now), "hoje"); assert.equal(agoText("2026-11-15T08:00:00Z", now), "ontem");
  assert.equal(agoText("2026-11-10T08:00:00Z", now), "há 6 dias"); assert.equal(agoText("2026-10-10T08:00:00Z", now), "há 1 mês"); assert.equal(agoText("2026-07-10T08:00:00Z", now), "há 4 meses");
  assert.equal(agoText("2025-11-10T08:00:00Z", now), "há 1 ano"); assert.equal(agoText("2024-01-10T08:00:00Z", now), "há 2 anos");
  assert.equal(agoText("2026-11-19T12:00:00Z", now), "em 3 dias"); assert.equal(agoText("lixo", now), ""); assert.equal(agoText(null, now), "");
});

test("detalhes em português; valor desconhecido não vaza texto cru", () => {
  assert.equal(eventDetailText("pedido", "confirmado"), "pago, esperando início"); assert.equal(eventDetailText("reembolso", "pendente"), "esperando decisão");
  assert.equal(eventDetailText("pedido", "<script>"), ""); assert.equal(eventDetailText("seguiu", "x"), ""); assert.equal(eventDetailText("pedido", null), "");
});

test("destinos apontam para rotas que existem; a equipe vai ao atendimento", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  for (const kind of Object.keys(EVENT_LABELS)) for (const role of ["titular", "equipe"]) { const t = eventTarget(kind, role); if (t) assert.ok(app.includes(`path="${t}"`), `${kind}/${role}: ${t}`); }
  assert.equal(eventTarget("pedido", "equipe"), "/atendimento"); assert.equal(eventTarget("pedido", "titular"), "/mensagens"); assert.equal(eventTarget("mensalidade", "titular"), "/mensalidades");
  assert.equal(eventTarget("avaliacao", "titular"), null); assert.equal(eventTarget("reembolso", "titular"), null);
  assert.ok(app.includes('path="/pessoas"'));
});

test("coerência com o SQL: segmentos e tipos de evento da migration existem na tela e o contrário", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0131_pessoas_da_casa.sql", import.meta.url), "utf8");
  const sqlSegs = [...sql.matchAll(/\(\d, '([a-z]+)', [a-z]\.[a-z]+\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(sqlSegs)].sort(), SEGMENTS.filter((s) => s !== "todos").sort());
  const validList = sql.match(/v_seg not in \(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(validList.sort(), [...SEGMENTS].sort());
  for (const s of SEGMENTS) { assert.ok(SEGMENT_LABELS[s]); assert.ok(SEGMENT_HINTS[s]); }
  const kinds = new Set([...sql.matchAll(/'(seguiu|conversa|mensagem|pedido_concluido|pedido|reserva|membro_saiu|membro|mensalidade|avaliacao|reembolso)'(?:,|\s|::)/g)].map((m) => m[1]));
  for (const k of ["seguiu", "conversa", "mensagem", "pedido", "pedido_concluido", "reserva", "membro", "membro_saiu", "mensalidade", "avaliacao", "reembolso"]) { assert.ok(kinds.has(k), `SQL sem o tipo ${k}`); assert.ok(EVENT_LABELS[k], `tela sem o tipo ${k}`); }
  for (const a of ["passada_para_casa", "assumida", "devolvida"]) assert.ok(EVENT_LABELS[`assistente_${a}`]);
});
