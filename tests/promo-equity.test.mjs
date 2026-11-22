import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupLabel, readEquity, describeEquity } from "../src/lib/promoEquityCore.js";

const sql = readFileSync(new URL("../supabase/migrations/0176_indice_de_equilibrio.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");

test("rótulo do alcance", () => {
  assert.deepEqual(groupLabel("cidade:sao paulo/sp"), { scope: "Cidade", place: "Sao Paulo/SP" });
  assert.deepEqual(groupLabel("estado:ba"), { scope: "Estado", place: "BA" });
  assert.deepEqual(groupLabel("pais:BR"), { scope: "País", place: "BR" });
  assert.deepEqual(groupLabel(null), { scope: "Alcance", place: "—" });
});
test("leitura defensiva", () => {
  assert.deepEqual(readEquity(null), []);
  assert.deepEqual(readEquity([null, { group: 5 }, { group: "pais:BR", items: [null, { house_id: 3 }] }])[0].items, []);
  const g = readEquity([{ group: "pais:BR", houses: 2, total_views: "70", median_exposure: 10, top_exposure: 12, top_ratio: 1.2, items: [{ house_id: "a", name: "Casa A", views: 50, active_days: 5, exposure: 10, share_pct: 71.4 }] }])[0];
  assert.equal(g.totalViews, 70); assert.equal(g.items[0].share, 71.4); assert.equal(g.ratio, 1.2);
});
test("descrição só descreve: nunca julga equilíbrio e trata casos de borda", () => {
  const base = { group: "pais:BR", scope: "País", place: "BR", houses: 3, totalViews: 70, median: 10, top: 25, ratio: 2.5, items: [{ houseId: "a", name: "Casa A", views: 50, activeDays: 2, exposure: 25, share: 71.4 }] };
  assert.equal(describeEquity(base), "Casa A recebeu 2,5× a exposição mediana por dia ativo (25 contra 10 visualizações/dia), com 71,4% das visualizações entre 3 casas.");
  assert.match(describeEquity({ ...base, houses: 1 }), /não há com o que comparar/);
  assert.match(describeEquity({ ...base, totalViews: 0 }), /Nenhuma visualização/);
  assert.match(describeEquity({ ...base, ratio: null, median: 0 }), /mediana por dia ativo foi zero/);
  for (const g of [base, { ...base, ratio: 9 }]) assert.ok(!/desequilibr|injust|favorec/i.test(describeEquity(g)));
});
test("0176: só leitura, só administração, sem tocar sorteio nem dinheiro", () => {
  assert.match(sql, /if not public\.is_admin\(\) then raise exception 'not_admin'/);
  assert.match(sql, /language plpgsql stable security definer/);
  assert.ok(!/\b(insert|update|delete|drop|alter|create table)\b/i.test(sql.replace(/create or replace function/gi, "")));
  assert.ok(!/platform_charges|payouts|commission|refund/i.test(sql));
  assert.match(sql, /grant execute on function public\.admin_promo_equity\(int\) to authenticated, service_role/);
  assert.match(sql, /revoke all on function public\.admin_promo_equity\(int\) from public, anon, authenticated/);
  assert.match(sql, /least\(coalesce\(p_days, 30\), 90\)/);
  assert.match(sql, /percentile_cont\(0\.5\)/);
});
