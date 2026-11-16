// Central de pendências da casa: leitura defensiva, destinos por papel e coerência com o SQL (0130).
import { houseReviewsPath } from "../src/lib/housePendingCore.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOUSE_KIND_LABELS, houseTarget, readHousePending, filterPending, dueText } from "../src/lib/housePendingCore.js";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const item = (o = {}) => ({ kind: "conversa_sem_resposta", ref_id: U(1), title: "Conversa com Ana", detail: "sem_resposta", priority: "normal", due_at: "2026-11-16T10:00:00Z", overdue: true, since: "2026-11-15T10:00:00Z", tab: "atendimento", ...o });
const raw = (items, o = {}) => ({ house_id: U(9), house_name: "Casa Um", role: "titular", total: items.length, overdue: items.filter((i) => i && i.overdue).length, counts: { conversa_sem_resposta: items.length }, items, to_pay: null, ...o });

test("lê o formato do banco", () => {
  const v = readHousePending(raw([item()]));
  assert.equal(v.role, "titular"); assert.equal(v.houseName, "Casa Um"); assert.equal(v.total, 1); assert.equal(v.shown, 1);
  assert.deepEqual(v.items[0], { kind: "conversa_sem_resposta", refId: U(1), title: "Conversa com Ana", detail: "sem_resposta", priority: "normal", dueAt: "2026-11-16T10:00:00Z", overdue: true, since: "2026-11-15T10:00:00Z", tab: "atendimento" });
  assert.equal(v.toPay, null);
});

test("entrada ruim vira lista vazia, sem quebrar", () => {
  for (const bad of [null, undefined, 3, "x", [], {}, { items: "x" }, { items: [null, 3, "a"] }]) { const v = readHousePending(bad); assert.equal(v.items.length, 0); assert.equal(v.total, 0); assert.equal(v.toPay, null); }
});

test("descarta linhas malformadas, tipos desconhecidos e ids que não são UUID; corrige prioridade e aba inválidas", () => {
  const v = readHousePending(raw([item(), item({ kind: "inventado" }), item({ ref_id: "../../etc" }), item({ ref_id: 7 }), item({ ref_id: U(2), priority: "urgente", tab: "x" }), item({ ref_id: U(3), title: "" }), null]));
  assert.equal(v.items.length, 3);
  const b = v.items.find((i) => i.refId === U(2)); assert.equal(b.priority, "normal"); assert.equal(b.tab, null);
  assert.equal(v.items.find((i) => i.refId === U(3)).title, HOUSE_KIND_LABELS.conversa_sem_resposta);
});

test("papel desconhecido vira titular só no formato; 'equipe' é preservado; contagens só numéricas e conhecidas", () => {
  assert.equal(readHousePending(raw([], { role: "equipe" })).role, "equipe");
  assert.equal(readHousePending(raw([], { role: "admin" })).role, "titular");
  const v = readHousePending(raw([item()], { counts: { conversa_sem_resposta: 4, inventado: 9, fatura: "x" }, total: "5", overdue: -2 }));
  assert.deepEqual(v.counts, { conversa_sem_resposta: 4, fatura: 0 }); assert.equal(v.total, 0); assert.equal(v.overdue, 0);
});

test("'a pagar': soma, ordem de vencimento mantida, descontos absurdos e linhas ruins descartados", () => {
  const ch = (o) => ({ id: U(5), kind: "plan", description: "Plano Premium", amount_cents: 29990, due_date: "2026-11-20", status: "aberta", pix_discount_cents: 1500, overdue: false, ...o });
  const v = readHousePending(raw([], { to_pay: { total_cents: 1, count: 99, charges: [ch({}), ch({ id: U(6), due_date: "2026-11-10", overdue: true, pix_discount_cents: 99999 }), ch({ id: U(7), pix_discount_cents: -5 }), ch({ id: U(8), amount_cents: -1 }), ch({ id: U(10), due_date: "amanhã" }), ch({ id: 3 }), null] } }));
  assert.equal(v.toPay.charges.length, 3);
  assert.equal(v.toPay.count, 3);
  assert.equal(v.toPay.totalCents, 29990 * 3);
  assert.equal(v.toPay.charges[0].pixDiscountCents, 1500);
  assert.equal(v.toPay.charges[1].pixDiscountCents, 0); // desconto maior que a fatura é ignorado
  assert.equal(v.toPay.charges[2].pixDiscountCents, 0); // negativo é ignorado
  assert.equal(v.toPay.charges[1].overdue, true);
});

test("destinos: a equipe vai ao atendimento, a titular às telas próprias; tudo aponta para rota que existe", () => {
  assert.equal(houseTarget("atendimento", "equipe").path, "/atendimento");
  assert.equal(houseTarget("atendimento", "titular").path, "/mensagens");
  assert.equal(houseTarget("mensalidades", "titular").path, "/mensalidades");
  assert.equal(houseTarget("avaliacoes", "titular").path, null); // a tela completa com o id da casa
  assert.equal(houseTarget("x", "titular"), null);
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  for (const tab of ["atendimento", "pedidos", "mensalidades", "moderacao", "suporte", "cobranca", "cadastro", "assistente"]) for (const role of ["titular", "equipe"]) {
    const t = houseTarget(tab, role); assert.ok(t && t.path && app.includes(`path="${t.path}"`), `${tab}/${role} aponta para rota inexistente: ${t?.path}`);
  }
});

test("coerência com o SQL: todo tipo e toda aba emitidos pela migration existem na tela, e o contrário", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0130_central_de_pendencias_casa.sql", import.meta.url), "utf8");
  const body = sql.slice(sql.indexOf("create or replace function public.house_pending_center"));
  const kinds = new Set([...body.matchAll(/select '([a-z_]+)'(?:::text)? kind|select '([a-z_]+)',/g)].map((m) => m[1] ?? m[2]));
  for (const k of kinds) assert.ok(k in HOUSE_KIND_LABELS, `tela não conhece '${k}'`);
  for (const k of Object.keys(HOUSE_KIND_LABELS)) assert.ok(kinds.has(k), `tela tem '${k}' que o SQL não emite`);
  for (const tab of ["atendimento", "pedidos", "mensalidades", "avaliacoes", "moderacao", "suporte", "cobranca", "cadastro", "assistente"]) assert.ok(body.includes(`'${tab}'`), `SQL não usa a aba '${tab}'`);
});

test("filtros e prazos reaproveitam o mesmo comportamento da central da administração", () => {
  const v = readHousePending(raw([item(), item({ ref_id: U(2), kind: "fatura", overdue: false, tab: "cobranca", priority: "alta" })]));
  assert.equal(filterPending(v.items, { onlyOverdue: true }).length, 1);
  assert.equal(filterPending(v.items, { kind: "fatura" }).length, 1);
  assert.equal(dueText(null), "sem prazo");
});

test("avaliação sem resposta abre a página da casa pelo id da conta da titular, na aba de avaliações", () => {
  assert.equal(houseReviewsPath("titular", "f847527a-266e-494d-9163-80736aeedae5"), "/casa/f847527a-266e-494d-9163-80736aeedae5?aba=avaliacoes");
  assert.equal(houseReviewsPath("equipe", "f847527a-266e-494d-9163-80736aeedae5"), null);
  assert.equal(houseReviewsPath("titular", null), null); assert.equal(houseReviewsPath("titular", ""), null); assert.equal(houseReviewsPath("titular", undefined), null);
  assert.equal(houseReviewsPath("titular", "a/b?x"), "/casa/a%2Fb%3Fx?aba=avaliacoes");
});
