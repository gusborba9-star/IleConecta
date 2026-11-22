import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const code = readFileSync(new URL("../supabase/migrations/0175_aparelhos_e_frequencia.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
test("0175: só soma aparelhos novos informados pelo aparelho; não guarda histórico por pessoa nem toca dinheiro", () => {
  assert.match(code, /add column if not exists devices_new int not null default 0/);
  assert.ok(!/create table|platform_charges|payouts|commission|refund/i.test(code));
  assert.ok(!/insert into public\.(?!promo_events|promo_stats)/i.test(code));
  assert.match(code, /drop function if exists public\.promo_track\(uuid\[\], text, text, text\)/);
  assert.match(code, /grant execute on function public\.promo_track\(uuid\[\], text, text, text, uuid\[\]\) to authenticated, service_role/);
  assert.match(code, /revoke all on function public\.promo_track\(uuid\[\], text, text, text, uuid\[\]\) from public, anon, authenticated/);
});
