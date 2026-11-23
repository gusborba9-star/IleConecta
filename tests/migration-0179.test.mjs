import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/0179_reunioes_por_video.sql", import.meta.url), "utf8");
const code = sql.replace(/--.*$/gm, "");

test("0179: vídeo nasce desligado, com Daily como provedor", () => {
  assert.match(code, /'video', '\{"state":"off","provider":"daily","beta_houses":\[\]\}'/);
});
test("0179: tabelas fechadas (RLS ligada, sem acesso direto de ninguém logado)", () => {
  for (const t of ["video_meetings", "video_usage"]) {
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(code, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`));
  }
  assert.ok(!/create policy/i.test(code));
});
test("0179: só o servidor grava consumo e encerra sala; as funções da pessoa vão para os logados", () => {
  assert.match(code, /grant execute on function public\.video_record_usage\(text, text, uuid, timestamptz, timestamptz\), public\.video_close_room\(text\) to service_role/);
  assert.match(code, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/g);
  const auth = code.match(/grant execute on function ([^;]+) to authenticated;/)[1];
  assert.ok(!/record_usage|close_room/.test(auth));
});
test("0179: limites de reunião (5 a 90 min, 2 a 100 pessoas) e consulta de 2 pessoas", () => {
  assert.match(code, /duration_min int not null check \(duration_min between 5 and 90\)/);
  assert.match(code, /max_participants int not null check \(max_participants between 2 and 100\)/);
  assert.match(code, /v_max := 2;/);
});
test("0179: nome da sala não adivinhável e consumo limitado ao tempo da reunião", () => {
  assert.match(code, /'ic-' \|\| replace\(gen_random_uuid\(\)::text, '-', ''\)/);
  assert.match(code, /m\.duration_min \+ 15/);
});
test("0179: não toca em dinheiro, planos nem comissão; só cria e reconfigura a chave 'video'", () => {
  assert.ok(!/platform_charges|payouts|commission|refund_cents|amount_cents|update\s+public\.houses/i.test(code));
});
test("0179: limpeza do consumo em 12 meses e das reuniões esquecidas", () => {
  assert.match(code, /interval '12 months'/);
  assert.match(code, /cron\.schedule\('purge-video-usage'/);
  assert.match(code, /cron\.schedule\('video-close-stale'/);
});
