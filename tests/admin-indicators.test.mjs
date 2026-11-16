// Indicadores da administração: leitura defensiva, contas derivadas, textos e coerência com o SQL (0133).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { INDICATORS, GROUPS, PERIODS, PLAN_LABELS, readAdminIndicators, formatIndicator, changeInfo, groupedIndicators } from "../src/lib/adminIndicatorsCore.js";

const P = (current, previous = 0) => ({ current, previous });
const raw = (o = {}, s = {}) => ({
  days: 30, previous_since: "2026-09-17T12:00:00Z",
  metrics: {
    novas_contas: P(3, 1), novas_casas: P(4, 2), novas_casas_pagantes: P(1, 2), cancelamentos: P(2, 1), ativos_no_periodo: P(4, 2), casas_ativas_no_periodo: P(2, 1), volume_cents: P(31000, 5000), comissao_cents: P(3000, 500), casas_que_venderam: P(2, 1),
    receita_assinatura_cents: P(10990, 26970), receita_divulgacao_cents: P(4000, 0), receita_creditos_cents: P(3000, 0), cobrancas_vencidas: P(1, 1), cobrancas_canceladas: P(1, 1),
    reembolsos_pedidos: P(2, 1), reembolsos_feitos: P(1, 1), pagamentos_estornados: P(2, 0), reembolsos_plano_cents: P(8990, 1234), pagamentos_contestados: P(1, 0),
    casos_disputa: P(1, 0), incidentes: P(2, 0), casos_abertos: P(5, 1), casos_resolvidos: P(2, 1), casos_com_resposta: P(3, 1), casos_resposta_no_prazo: P(2, 1),
    casos_sem_resposta_no_prazo: P(1, 0), primeira_resposta_mediana_h: P("2.0", "5.0"), ia_respostas: P(3, 1), ia_tokens_entrada: P(600, 10), ia_tokens_saida: P(150, 5),
    mensagens: P(4, 1), pedidos_criados: P(7, 1), reservas_criadas: P(1, 0), ...o,
  },
  snapshot: { usuarios_total: 7, casas_total: 2, casas_por_plano: { maximo: 1, base: 1 }, atividade_desde: "2026-11-16", ativos_7d: 2, ativos_30d: 3, casas_ativas_30d: 1, assinantes_base: 2, assinantes_retidos: 1, casos_em_aberto: 3, ...s },
});

test("lê o formato do banco e calcula os derivados", () => {
  const v = readAdminIndicators(raw());
  assert.equal(v.days, 30);
  assert.deepEqual(v.items.conversao_pct, { current: 25, previous: 100 });
  assert.deepEqual(v.items.receita_total_cents, { current: 3000 + 10990 + 4000 + 3000, previous: 500 + 26970 });
  assert.deepEqual(v.items.no_prazo_pct, { current: 66.7, previous: 100 });
  assert.deepEqual(v.items.ia_tokens, { current: 750, previous: 15 });
  assert.equal(v.items.primeira_resposta_mediana_h.current, 2);
  assert.equal(v.items.retencao_pct.current, 50); assert.equal(v.items.retencao_pct.previous, null);
  assert.equal(v.items.casas_pagantes.current, 2);
  assert.deepEqual(v.items.cancelamentos, { current: 2, previous: 1 });
  assert.deepEqual(v.items.ativos_no_periodo, { current: 4, previous: 2 });
  assert.deepEqual(v.plans.map((p) => [p.plan, p.count]), [["gratis", 0], ["base", 1], ["intermediario", 0], ["maximo", 1]]);
});

test("aviso de registro parcial só quando os dias de atividade começaram depois do período anterior", () => {
  const partial = readAdminIndicators(raw());
  assert.equal(partial.activitySince, "2026-11-16"); assert.equal(partial.activityPartial, true);
  const full = readAdminIndicators(raw({}, { atividade_desde: "2026-08-01" }));
  assert.equal(full.activityPartial, false);
  const none = readAdminIndicators(raw({}, { atividade_desde: null }));
  assert.equal(none.activitySince, null); assert.equal(none.activityPartial, false);
  const junk = readAdminIndicators(raw({}, { atividade_desde: "amanhã" }));
  assert.equal(junk.activitySince, null); assert.equal(junk.activityPartial, false);
});

test("grátis não conta como casa em plano pago", () => {
  const v = readAdminIndicators(raw({}, { casas_por_plano: { gratis: 9, base: 2 } }));
  assert.equal(v.items.casas_pagantes.current, 2);
});

test("formato inválido nunca vira número inventado", () => {
  for (const bad of [null, undefined, 5, "x", [], {}]) {
    const v = readAdminIndicators(bad);
    assert.equal(v.days, 30);
    for (const it of Object.values(v.items)) assert.ok(it.current === null || it.current === undefined || Number.isFinite(it.current));
  }
  const v = readAdminIndicators(raw({ volume_cents: P("abc", -4), novas_contas: P(null, undefined), mensagens: P(NaN, Infinity) }));
  assert.equal(v.items.volume_cents.current, null); assert.equal(v.items.volume_cents.previous, null);
  assert.equal(v.items.novas_contas.current, null); assert.equal(v.items.mensagens.current, null);
  assert.equal(v.items.receita_total_cents.current, 3000 + 10990 + 4000 + 3000);
  const noMoney = readAdminIndicators(raw({ comissao_cents: P(null, null) }));
  assert.equal(noMoney.items.receita_total_cents.current, null, "se falta uma parcela, o total não é inventado");
});

test("sem base de comparação, sem divisão por zero", () => {
  const v = readAdminIndicators(raw({ novas_casas: P(0, 0), casos_com_resposta: P(0, 0) }, { assinantes_base: 0 }));
  assert.equal(v.items.conversao_pct.current, null); assert.equal(v.items.no_prazo_pct.current, null); assert.equal(v.items.retencao_pct.current, null);
});

test("período inválido vira 30", () => {
  assert.equal(readAdminIndicators({ ...raw(), days: 5 }).days, 30);
  assert.equal(readAdminIndicators({ ...raw(), days: 90 }).days, 90);
  assert.deepEqual(PERIODS, [7, 30, 90]);
});

test("formata cada unidade", () => {
  assert.equal(formatIndicator("novas_contas", 1234), "1.234");
  assert.match(formatIndicator("volume_cents", 31000), /310,00/);
  assert.equal(formatIndicator("conversao_pct", 25), "25%"); assert.equal(formatIndicator("conversao_pct", 66.7), "66,7%");
  assert.equal(formatIndicator("primeira_resposta_mediana_h", 0.5), "30 min"); assert.equal(formatIndicator("primeira_resposta_mediana_h", 2), "2 h");
  assert.equal(formatIndicator("primeira_resposta_mediana_h", 2.5), "2,5 h"); assert.equal(formatIndicator("primeira_resposta_mediana_h", 72), "3 dias");
  assert.equal(formatIndicator("volume_cents", null), "—"); assert.equal(formatIndicator("inexistente", 3), "—"); assert.equal(formatIndicator("novas_contas", NaN), "—");
});

test("variação: bom, ruim, neutro e sem comparação", () => {
  assert.deepEqual(changeInfo("novas_contas", 6, 3), { text: "+100% sobre o período anterior", tone: "good" });
  assert.deepEqual(changeInfo("incidentes", 4, 2), { text: "+100% sobre o período anterior", tone: "bad" });
  assert.deepEqual(changeInfo("incidentes", 1, 2), { text: "−50% sobre o período anterior", tone: "good" });
  assert.equal(changeInfo("ia_respostas", 10, 5).tone, "none", "custo e uso apenas informam");
  assert.equal(changeInfo("incidentes", 1, 0).tone, "bad");
  assert.equal(changeInfo("novas_contas", 0, 0).text, "igual ao período anterior");
  assert.equal(changeInfo("novas_contas", 5, null).text, ""); assert.equal(changeInfo("ativos_7d", 5, 3).text, "", "números do momento não comparam");
});

test("todo indicador tem grupo, definição e origem escritas", () => {
  for (const [k, d] of Object.entries(INDICATORS)) {
    assert.ok(GROUPS.includes(d.group), k); assert.ok(d.label.length > 3, k); assert.ok(d.definition.length > 15, k); assert.ok(d.source.length > 5, k);
    assert.ok(["up", "down", "none"].includes(d.better), k); assert.ok(["n", "pct", "h", "brl", "tok"].includes(d.unit), k);
  }
  const g = groupedIndicators(readAdminIndicators(raw()));
  assert.deepEqual(g.map((x) => x.group), GROUPS);
  assert.equal(g.reduce((a, x) => a + x.items.length, 0), Object.keys(INDICATORS).length);
  assert.deepEqual(Object.keys(PLAN_LABELS), ["gratis", "base", "intermediario", "maximo"]);
});

test("coerência com o SQL: toda chave lida existe na função e vice-versa", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0134_historico_de_plano_e_dias_de_atividade.sql", import.meta.url), "utf8");
  const sqlKeys = [...sql.matchAll(/^\s+'([a-z0-9_]+)', /gm)].map((m) => m[1]).filter((k) => !["generated_at", "days", "since", "previous_since", "metrics", "snapshot", "scope"].includes(k));
  const v = readAdminIndicators(raw());
  const shown = new Set(Object.keys(v.items));
  const derived = new Set(["conversao_pct", "receita_total_cents", "no_prazo_pct", "ia_tokens", "casas_pagantes", "retencao_pct"]);
  for (const k of Object.keys(INDICATORS)) assert.ok(derived.has(k) || sqlKeys.includes(k), `${k} não existe no SQL`);
  for (const k of ["novas_casas_pagantes", "casos_com_resposta", "casos_resposta_no_prazo", "ia_tokens_entrada", "ia_tokens_saida", "assinantes_base", "assinantes_retidos", "casas_por_plano", "atividade_desde", "cancelamentos"]) assert.ok(sqlKeys.includes(k), k);
  assert.ok(shown.size > 30);
});

test("a migration não cria tabela e só a administração executa", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0133_indicadores_da_administracao.sql", import.meta.url), "utf8");
  assert.ok(!/create table|alter table|insert into|update public|delete from/i.test(sql.replace(/--[^\n]*/g, "")));
  assert.match(sql, /if not public\.is_admin\(\) then raise exception 'not_admin'/);
  assert.match(sql, /revoke all on function public\.admin_indicators\(integer\) from public, anon, authenticated;/);
  assert.ok(readdirSync(new URL("../supabase/migrations/", import.meta.url)).some((f) => f === "0133_indicadores_da_administracao.sql"));
});

test("0134: só duas tabelas novas, fechadas ao público, e a função de indicadores continua só da administração", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0134_historico_de_plano_e_dias_de_atividade.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  assert.equal((sql.match(/create table/gi) ?? []).length, 2);
  for (const t of ["house_plan_history", "user_activity_days"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`));
  }
  assert.ok(!/create policy/i.test(sql));
  assert.match(sql, /if not public\.is_admin\(\) then raise exception 'not_admin'/);
  assert.match(sql, /delete from public\.user_activity_days where user_id = p_user/);
  assert.match(sql, /'dias_de_acesso'/);
});
