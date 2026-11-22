import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/0173_anuncios_pela_cidade_do_momento.sql", import.meta.url), "utf8");

test("0173: só troca as duas funções de leitura de anúncios; não toca dinheiro", () => {
  const drops = [...sql.matchAll(/\bdrop\s+\w+\s+if exists\s+([^;]*);/gi)].map((m) => m[1].replace(/\s+/g, " "));
  assert.deepEqual(drops, ["public.promotions_visible()", "public.promo_track(uuid[], text)"]);
  assert.ok(!/platform_charges|payouts|refund|commission|amount_cents\s*=|update\s+public\.promotions/i.test(sql.replace(/--.*$/gm, "")));
  assert.ok(!/\binsert\s+into\s+public\.(?!promo_events|promo_stats)/i.test(sql));
});
test("0173: cidade do momento só vale com cidade e UF de duas letras; permissões mantidas", () => {
  assert.match(sql, /v_ps ~ '\^\[a-z\]\{2\}\$'/);
  assert.match(sql, /grant execute on function public\.promotions_visible\(text, text\) to anon, authenticated, service_role/);
  assert.match(sql, /revoke all on function public\.promo_track\(uuid\[\], text, text, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.promo_track\(uuid\[\], text, text, text\) to authenticated, service_role/);
  assert.match(sql, /not exists \(select 1 from public\.houses h where h\.id = p\.house_id and h\.owner_id = auth\.uid\(\)\)/); // dono não conta a própria visualização
});
