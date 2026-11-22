import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/0174_funil_atribuido.sql", import.meta.url), "utf8");
const code = sql.replace(/--.*$/gm, "");

test("0174: só cria; não apaga nem reescreve nada existente e não toca dinheiro", () => {
  assert.ok(!/\b(drop|truncate|alter\s+table\s+public\.(?!app_secrets|promo_conversions))/i.test(code));
  assert.ok(!/update\s+public\.|insert\s+into\s+public\.(?!app_secrets|promo_conversions)/i.test(code));
  assert.ok(!/platform_charges|payouts|commission|refund_cents|amount_cents/i.test(code));
});
test("0174: segredo e conversões fechados (RLS ligada, sem acesso direto)", () => {
  for (const t of ["app_secrets", "promo_conversions"]) {
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(code, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`));
  }
  assert.ok(!/create policy/i.test(code));
});
test("0174: token assinado no servidor, validade de 7 dias, sem horário vindo do aparelho", () => {
  assert.match(code, /extensions\.hmac\(v_payload, v_sec, 'sha256'\)/);
  assert.match(code, /'exp', v_now \+ 7 \* 86400/);
  assert.match(code, /'iat', v_now/);
  assert.ok(!/p_(clicked|click_at|at|time)\b/i.test(code)); // nenhuma função recebe horário do aparelho
});
test("0174: atribuição exige casa, item e pessoa certos e nunca levanta erro", () => {
  assert.match(code, /o\.client_id = v_uid and o\.house_id = p\.house_id/);
  assert.match(code, /p\.item_type = 'service' and p\.item_id is not distinct from v_svc/);
  assert.match(code, /p\.item_type = 'event' and p\.item_id is not distinct from v_ev/);
  assert.match(code, /po\.event_id is not distinct from v_ev/);
  assert.match(code, /exception when others then return 'ignorado'/);
  assert.match(code, /unique \(ref_type, ref_id\)/);
  assert.match(code, /v_created < v_iat - interval '1 minute'/);
});
test("0174: permissões e retenção de 13 meses", () => {
  assert.match(code, /revoke all on function public\.promo_open\(uuid, text, text\), public\.promo_attribute\(text, text, uuid\), public\.promo_funnel\(\) from public, anon, authenticated/);
  assert.match(code, /grant execute on function public\.promo_open\(uuid, text, text\), public\.promo_attribute\(text, text, uuid\), public\.promo_funnel\(\) to authenticated, service_role/);
  assert.match(code, /purge-promo-conversions.*interval '13 months'/s);
});
