import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8").replace(/--.*$/gm, "");
const a = rd("0180_video_sala_no_provedor.sql");
const b = rd("0181_video_consumo_sem_buraco.sql");

test("0180: sala no provedor só é lida e gravada pelo servidor; primeira gravação vence", () => {
  assert.match(a, /provider_ref = coalesce\(provider_ref, p_ref\)/);
  assert.match(a, /revoke all on function public\.video_room_get\(uuid\), public\.video_set_room\(uuid, text, text, text\) from public, anon, authenticated/);
  assert.match(a, /grant execute on function public\.video_room_get\(uuid\), public\.video_set_room\(uuid, text, text, text\) to service_role/);
  assert.equal((a.match(/auth\.role\(\), ''\) <> 'service_role'/g) ?? []).length >= 4, true);
});
test("0180: entrada exige login, permissão, janela, minutos e lotação", () => {
  for (const r of ["sem_login", "sem_acesso", "desligado", "cedo", "encerrada", "sem_minutos", "lotada"]) assert.match(a, new RegExp(`'${r}'`));
  assert.match(a, /grant execute on function public\.video_join_check\(uuid\) to authenticated/);
});
test("0180: consumo é limitado à duração + 15 minutos e aceita nome ou código da sala", () => {
  assert.match(a, /m\.duration_min \+ 15/);
  assert.match(a, /room_name = p_room or provider_ref = p_room/);
});
test("0181: sessões esquecidas são fechadas por rotina a cada 15 minutos, só pelo servidor", () => {
  assert.match(b, /video_finalize_stale/);
  assert.match(b, /\*\/15 \* \* \* \*/);
  assert.match(b, /revoke all on function public\.video_finalize_stale\(\) from public, anon, authenticated/);
});
