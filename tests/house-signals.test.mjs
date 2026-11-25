import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0219_visitas_e_intencoes_da_casa.sql", import.meta.url), "utf8");

test("migração 0219: tabelas fechadas, só totais por casa/dia/tipo e chaves que não guardam quem visitou", () => {
  assert.match(sql, /alter table public\.house_signal_seen enable row level security/);
  assert.match(sql, /alter table public\.house_signal_daily enable row level security/);
  assert.match(sql, /revoke all on public\.house_signal_seen, public\.house_signal_daily from public, anon, authenticated/);
  assert.match(sql, /extensions\.hmac\(v_day::text \|\| '\|' \|\| h\.id::text/);
  assert.doesNotMatch(sql.slice(sql.indexOf("create table if not exists public.house_signal_seen"), sql.indexOf("alter table public.house_signal_seen")), /user_id/);
});

test("migração 0219: desligado por padrão, nunca levanta erro ao visitante, exclui titular e equipe, tem tetos", () => {
  assert.match(sql, /value -> 'house_signals' ->> 'state' = 'on'/);
  assert.match(sql, /if not public\.house_signals_on\(\)[^\n]*then return false/);
  assert.match(sql, /exception when others then return false/);
  assert.match(sql, /v_uid = h\.owner_id or exists \(select 1 from public\.staff_row\(\)/);
  assert.match(sql, /n < 20/);
  assert.match(sql, />= 20000 then return false/);
  assert.match(sql, /char_length\(p_client\) not between 12 and 64/);
});

test("migração 0219: leitura só da titular ou equipe com indicadores; limpeza horária e 13 meses", () => {
  assert.match(sql, /'stats' = any \(v_perms\)/);
  assert.match(sql, /revoke all on function public\.house_signals\(integer\) from public, anon/);
  assert.match(sql, /cron\.schedule\('house-signals-clean', '7 \* \* \* \*'/);
  assert.match(sql, /day < \(now\(\) at time zone 'America\/Sao_Paulo'\)::date - 400/);
});
