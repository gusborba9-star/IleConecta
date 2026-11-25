// Central de pendências da administração: leitura defensiva, prazos e filtros, e coerência com o SQL (0129).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KIND_LABELS, PRIORITY_LABELS, TAB_TARGET, dueText, filterPending, readPending } from "../src/lib/pendingCenterCore.js";

const item = (o = {}) => ({ kind: "suporte", ref_id: "r1", house_id: "h1", house_name: "Casa Um", title: "Cobrança em duplicidade", detail: "pagamento", priority: "alta", due_at: "2026-11-16T10:00:00Z", overdue: true, since: "2026-11-15T10:00:00Z", tab: "suporte", ...o });
const raw = (items, o = {}) => ({ generated_at: "2026-11-16T12:00:00Z", total: items.length, overdue: items.filter((i) => i.overdue).length, counts: { suporte: items.length }, items, ...o });

test("lê o formato do banco", () => {
  const v = readPending(raw([item()]));
  assert.equal(v.total, 1); assert.equal(v.shown, 1); assert.equal(v.overdue, 1);
  assert.deepEqual(v.items[0], { kind: "suporte", refId: "r1", houseId: "h1", houseName: "Casa Um", title: "Cobrança em duplicidade", detail: "pagamento", priority: "alta", dueAt: "2026-11-16T10:00:00Z", overdue: true, since: "2026-11-15T10:00:00Z", tab: "suporte" });
});

test("entrada ruim vira lista vazia, sem quebrar", () => {
  for (const bad of [null, undefined, 5, "x", [], {}, { items: "x" }, { items: [null, 3, "a"] }]) {
    const v = readPending(bad);
    assert.equal(v.items.length, 0); assert.equal(v.total, 0);
  }
});

test("descarta linhas malformadas e tipos desconhecidos; corrige prioridade e aba inválidas", () => {
  const v = readPending(raw([
    item(), item({ kind: "inventado" }), item({ ref_id: 7 }), item({ kind: undefined }),
    item({ ref_id: "r2", priority: "máxima", tab: "../etc" }), item({ ref_id: "r3", title: "" }), item({ ref_id: "r4", due_at: 5, house_id: 1, house_name: {} }),
  ]));
  assert.equal(v.items.length, 4);
  const r2 = v.items.find((i) => i.refId === "r2"); assert.equal(r2.priority, "normal"); assert.equal(r2.tab, null);
  assert.equal(v.items.find((i) => i.refId === "r3").title, KIND_LABELS.suporte);
  const r4 = v.items.find((i) => i.refId === "r4"); assert.equal(r4.dueAt, null); assert.equal(r4.houseId, null); assert.equal(r4.houseName, null);
});

test("contagens só de tipos conhecidos e só números", () => {
  const v = readPending(raw([item()], { counts: { suporte: 3, inventado: 9, moderacao: "x" }, total: "5" }));
  assert.deepEqual(v.counts, { suporte: 3, moderacao: 0 });
  assert.equal(v.total, 0);
});

test("o texto do título nunca é interpretado como marcação (fica texto puro)", () => {
  const v = readPending(raw([item({ title: "<img src=x onerror=alert(1)>" })]));
  assert.equal(v.items[0].title, "<img src=x onerror=alert(1)>"); // o React escapa; aqui só confirmamos que não é alterado nem executado
  assert.equal(typeof v.items[0].title, "string");
});

test("dueText: vencido, a vencer e sem prazo", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(dueText(null, now), "sem prazo");
  assert.equal(dueText("lixo", now), "sem prazo");
  assert.equal(dueText("2026-11-16T12:00:30Z", now), "vence em 1 min");
  assert.equal(dueText("2026-11-16T11:30:00Z", now), "venceu há 30 min");
  assert.equal(dueText("2026-11-16T09:00:00Z", now), "venceu há 3 h");
  assert.equal(dueText("2026-11-16T14:00:00Z", now), "vence em 2 h");
  assert.equal(dueText("2026-11-19T12:00:00Z", now), "vence em 3 d");
  assert.equal(dueText("2026-11-10T12:00:00Z", now), "venceu há 6 d");
});

test("filtros por tipo, vencidas e prioridade", () => {
  const v = readPending(raw([item({ ref_id: "a" }), item({ ref_id: "b", kind: "moderacao", overdue: false, priority: "normal", tab: "moderacao" }), item({ ref_id: "c", kind: "denuncia_chat", overdue: false, tab: "denuncias" })]));
  assert.equal(filterPending(v.items).length, 3);
  assert.equal(filterPending(v.items, { kind: "moderacao" }).length, 1);
  assert.equal(filterPending(v.items, { onlyOverdue: true }).length, 1);
  assert.equal(filterPending(v.items, { priority: "normal" }).length, 1);
  assert.equal(filterPending(v.items, { kind: "suporte", onlyOverdue: true, priority: "alta" }).length, 1);
  assert.equal(filterPending(v.items, { kind: "suporte", priority: "normal" }).length, 0);
});

test("coerência com o SQL: todo tipo e toda aba usados na migration existem na tela", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0129_central_de_pendencias_admin.sql", import.meta.url), "utf8");
  const body = sql.slice(sql.indexOf("create or replace function public.admin_pending_center"));
  const kinds = new Set([...body.matchAll(/select '([a-z_]+)'(?:::text)? kind|select '([a-z_]+)',/g)].map((m) => m[1] ?? m[2]));
  for (const k of ["suporte", "moderacao", "denuncia_chat", "avaliacao_denunciada", "exclusao_conta", "reembolso_cliente", "reembolso_plataforma", "cobranca_travada", "pedido_reembolso"]) assert.ok(kinds.has(k), `SQL não emite '${k}'`);
  for (const k of kinds) assert.ok(k in KIND_LABELS, `tela não conhece o tipo '${k}'`);
  for (const k of Object.keys(KIND_LABELS)) assert.ok(kinds.has(k), `tela tem tipo '${k}' que o SQL não emite`);
  const tabs = new Set([...body.matchAll(/'([a-z]+)'(?:::text)? tab|, '([a-z]+)'\n?\s*(?:from|union)/g)].map((m) => m[1] ?? m[2]));
  for (const t of ["suporte", "moderacao", "denuncias", "avaliacoes", "financeiro", "cobranca"]) assert.ok(body.includes(`'${t}'`), `SQL não usa a aba '${t}'`);
  for (const t of Object.keys(TAB_TARGET)) assert.ok(body.includes(`'${t}'`), `aba '${t}' da tela não existe no SQL`);
  assert.deepEqual(Object.keys(PRIORITY_LABELS).sort(), ["alta", "normal", "urgente"]);
  void tabs;
});

test("cada destino aponta para um módulo e uma tela reais do painel", async () => {
  const { moduleById, screenById } = await import("../src/lib/adminNavCore.js");
  for (const [tab, t] of Object.entries(TAB_TARGET)) {
    assert.ok(moduleById(t.section), `módulo '${t.section}' (aba ${tab}) não existe no painel`);
    const sc = screenById(t.screen);
    assert.ok(sc && sc.module === t.section, `tela '${t.screen}' (aba ${tab}) não está em '${t.section}'`);
  }
});
