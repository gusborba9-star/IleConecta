// Indicadores da casa: leitura defensiva, contas derivadas, textos e coerência com o SQL (0132).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INDICATORS, GROUPS, PERIODS, readHouseIndicators, formatIndicator, changeInfo, groupedIndicators } from "../src/lib/houseIndicatorsCore.js";

const P = (current, previous = 0) => ({ current, previous });
const raw = (o = {}, role = "titular") => ({
  days: 30, role,
  metrics: {
    novos_seguidores: P(3, 2), pessoas_que_falaram: P(4, 1), tempo_resposta_min: P("90.0", 30), pedidos_criados: P(7, 2), pedidos_pagos: P(3, 2), pedidos_perdidos: P(2, 0),
    reservas_confirmadas: P(4, 1), reservas_canceladas: P(1, 0), clientes_no_periodo: P(5, 2), clientes_que_voltaram: P(1, 0),
    volume_cents: P(27000, 13000), reembolsos: P(1, 0), avaliacoes: P(2, 1), nota_media: P("4.50", "3.00"), ...o,
  },
  snapshot: { seguidores_total: 6, ocupacao_pct: "20.0", avaliacoes_sem_resposta: 2 },
});

test("lê o formato do banco e calcula os derivados", () => {
  const v = readHouseIndicators(raw());
  assert.equal(v.days, 30); assert.equal(v.role, "titular"); assert.equal(v.totalFollowers, 6);
  assert.deepEqual(v.items.conversao_pct, { current: 42.9, previous: 100 });
  assert.deepEqual(v.items.recorrencia_pct, { current: 20, previous: 0 });
  assert.deepEqual(v.items.ticket_medio_cents, { current: 3857, previous: 4333 }); // 27000 / (3 + 4) ; 13000 / (2 + 1)
  assert.equal(v.items.tempo_resposta_min.current, 90); assert.equal(v.items.nota_media.current, 4.5);
  assert.equal(v.items.ocupacao_pct.current, 20); assert.equal(v.items.ocupacao_pct.previous, null); assert.equal(v.items.avaliacoes_sem_resposta.current, 2);
  assert.ok(!("clientes_que_voltaram" in v.items));
});

test("divisão por zero nunca vira número inventado", () => {
  const v = readHouseIndicators(raw({ pedidos_criados: P(0, 0), pedidos_pagos: P(0, 0), clientes_no_periodo: P(0, 0), reservas_confirmadas: P(0, 0) }));
  assert.equal(v.items.conversao_pct.current, null); assert.equal(v.items.recorrencia_pct.current, null);
  assert.equal(v.items.ticket_medio_cents.current, null); assert.equal(formatIndicator("conversao_pct", null), "—");
});

test("entrada ruim vira vazio, sem quebrar; número negativo, texto e nulo viram 'sem dado'", () => {
  for (const bad of [null, undefined, 3, "x"]) { const v = readHouseIndicators(bad); assert.equal(v.days, 30); assert.deepEqual(v.items, {}); }
  for (const bad of [[], {}]) { const v = readHouseIndicators(bad); assert.ok(Object.values(v.items).every((i) => i.current === null && i.previous === null)); }
  const v = readHouseIndicators(raw({ pedidos_criados: P(-5, "abc"), novos_seguidores: P(null, undefined), pessoas_que_falaram: null, tempo_resposta_min: P(NaN, Infinity) }));
  assert.equal(v.items.pedidos_criados.current, null); assert.equal(v.items.pedidos_criados.previous, null); assert.equal(v.items.novos_seguidores.current, null);
  assert.equal(v.items.pessoas_que_falaram.current, null); assert.equal(v.items.tempo_resposta_min.current, null);
  assert.equal(readHouseIndicators({ ...raw(), days: 5 }).days, 30); assert.equal(readHouseIndicators({ ...raw(), role: "admin" }).role, "titular");
});

test("equipe: dinheiro, reembolso e avaliações somem mesmo que o servidor mandasse", () => {
  const v = readHouseIndicators(raw({}, "equipe"));
  for (const [k, d] of Object.entries(INDICATORS)) if (d.money) assert.deepEqual(v.items[k], { current: null, previous: null }, k);
  const keys = groupedIndicators(v).flatMap((g) => g.items.map((i) => i.key));
  for (const [k, d] of Object.entries(INDICATORS)) assert.equal(keys.includes(k), !d.money && d.group !== "Visibilidade", k);
  assert.ok(groupedIndicators(readHouseIndicators(raw())).flatMap((g) => g.items.map((i) => i.key)).includes("volume_cents"));
});

test("formatação: porcentagem, minutos, horas, dinheiro, nota e inteiros", () => {
  assert.equal(formatIndicator("conversao_pct", 42.9), "42,9%"); assert.equal(formatIndicator("conversao_pct", 50), "50%");
  assert.equal(formatIndicator("tempo_resposta_min", 0.4), "menos de 1 min"); assert.equal(formatIndicator("tempo_resposta_min", 45), "45 min");
  assert.equal(formatIndicator("tempo_resposta_min", 90), "1,5 h"); assert.equal(formatIndicator("tempo_resposta_min", 3000), "2,1 dias");
  assert.match(formatIndicator("volume_cents", 27000), /R\$\s270,00/); assert.equal(formatIndicator("nota_media", 4.5), "4,5");
  assert.equal(formatIndicator("pedidos_criados", 1200), "1.200"); assert.equal(formatIndicator("inventado", 3), "—"); assert.equal(formatIndicator("pedidos_criados", NaN), "—");
});

test("variação: sobe/desce, bom/ruim conforme o indicador, sem base não inventa", () => {
  assert.deepEqual(changeInfo("pedidos_criados", 7, 2), { text: "+250% sobre o período anterior", tone: "good" });
  assert.deepEqual(changeInfo("pedidos_perdidos", 2, 1), { text: "+100% sobre o período anterior", tone: "bad" });
  assert.deepEqual(changeInfo("tempo_resposta_min", 30, 90), { text: "−67% sobre o período anterior", tone: "good" });
  assert.deepEqual(changeInfo("pedidos_criados", 5, 5), { text: "igual ao período anterior", tone: "none" });
  assert.equal(changeInfo("pedidos_criados", 3, 0).text, "novo em relação ao período anterior");
  assert.deepEqual(changeInfo("pedidos_criados", 0, 0), { text: "igual ao período anterior", tone: "none" });
  assert.deepEqual(changeInfo("pedidos_criados", 3, null), { text: "", tone: "none" });
  assert.deepEqual(changeInfo("ocupacao_pct", 20, 10), { text: "", tone: "none" }); // número do momento não compara
  assert.deepEqual(changeInfo("inventado", 1, 2), { text: "", tone: "none" });
});

test("todo indicador tem nome, definição e origem em português; grupos e períodos coerentes", () => {
  for (const [k, d] of Object.entries(INDICATORS)) { assert.ok(d.label && d.definition.length > 20 && d.source.length > 10, k); assert.ok(GROUPS.includes(d.group), k); assert.ok(["up", "down"].includes(d.better), k); }
  assert.deepEqual(PERIODS, [7, 30, 90]);
});

test("coerência com o SQL: todo indicador do banco aparece na tela e o contrário (os derivados saem de contas)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0132_indicadores_da_casa.sql", import.meta.url), "utf8");
  const sqlKeys = [...sql.matchAll(/^\s+'([a-z_]+)', (?:case when|\(select)/gm)].map((m) => m[1]).filter((k) => !["generated_at", "metrics", "snapshot", "scope", "since", "previous_since", "days", "role"].includes(k));
  const derived = new Set(["conversao_pct", "recorrencia_pct", "ticket_medio_cents"]);
  // grupo "Visibilidade": vem de house_signals (0219), não de house_indicators
  const signals = new Set(["visitas", "alcance", "ofertas_abertas", "compartilhamentos", "interesse_pct", "conversa_pct"]);
  const fromSql = new Set(sqlKeys.filter((k) => !["seguidores_total", "clientes_que_voltaram"].includes(k)));
  const inUi = new Set(Object.keys(INDICATORS).filter((k) => !derived.has(k) && !signals.has(k)));
  assert.deepEqual([...fromSql].sort(), [...inUi].sort());
  assert.ok(/p_days in \(7, 30, 90\)/.test(sql));
  const app = readFileSync(new URL("../src/pages/HouseHome.tsx", import.meta.url), "utf8");
  assert.ok(app.includes("HouseIndicatorsCard"));
});

test("visibilidade: some enquanto o registro está desligado; ligado, junta visitas, alcance e as taxas do funil", async () => {
  const { mergeSignals } = await import("../src/lib/houseIndicatorsCore.js");
  const base = readHouseIndicators(raw());
  const off = mergeSignals(base, { enabled: false, days: 30 });
  assert.ok(!groupedIndicators(off).some((g) => g.group === "Visibilidade"));
  assert.ok(!groupedIndicators(mergeSignals(base, null)).some((g) => g.group === "Visibilidade"));
  const on = mergeSignals(base, { enabled: true, days: 30, signals: {
    visita: { current: { events: 120, people: 80 }, previous: { events: 60, people: 40 } },
    oferta: { current: { events: 30, people: 20 }, previous: { events: 10, people: 10 } },
    compartilhar: { current: { events: 5, people: 4 }, previous: { events: 0, people: 0 } } } });
  const g = groupedIndicators(on);
  assert.equal(g[0].group, "Visibilidade");
  assert.equal(on.items.visitas.current, 120);
  assert.equal(on.items.alcance.current, 80);
  assert.equal(on.items.ofertas_abertas.current, 20);
  assert.equal(on.items.interesse_pct.current, 25);
  assert.equal(on.items.interesse_pct.previous, 25);
  const nodata = mergeSignals(base, { enabled: true, days: 30, signals: { visita: { current: { events: 0, people: 0 }, previous: { events: 0, people: 0 } } } });
  assert.equal(nodata.items.interesse_pct.current, null);
});
