// EXEC-01 — garantias estáticas da migração 0064 (a execução real foi verificada em Postgres local; ver PR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0064_payment_provider_decoupling.sql", import.meta.url), "utf8");

test("0064: só adiciona; não derruba nem reescreve o que existe", () => {
  assert.ok(!/\bdrop\s+(table|column|index|constraint|function)\b/i.test(sql));
  assert.ok(!/create or replace function public\.(confirm_payment|complete_refund|complete_cancel_refund|record_processor_fee)\s*\(/i.test(sql));
  assert.ok(!/\b(delete\s+from|truncate)\b/i.test(sql));
  assert.ok(/add column if not exists locked_until/i.test(sql));
});

test("0064: funções sensíveis exigem service_role e não são públicas", () => {
  for (const fn of ["acquire_stripe_event", "finish_stripe_event", "confirm_payment_for", "record_processor_fee_for", "payments_missing_processor_fee"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(.*\\) from public, anon, authenticated`), fn);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(.*\\) to service_role`), fn);
  }
  assert.equal((sql.match(/auth\.role\(\)/g) ?? []).length >= 5, true);
});

test("0064: trava atômica por INSERT ... ON CONFLICT e restrição NOT VALID para o legado", () => {
  assert.match(sql, /on conflict \(id\) do update[\s\S]*where e\.processed_at is null and \(e\.locked_until is null or e\.locked_until < now\(\)\)/i);
  assert.match(sql, /payments_stripe_no_hold[\s\S]*not valid/i);
  assert.match(sql, /create trigger payments_guard_identity before update on public\.payments/i);
});

test("código não referencia funções que a migração não cria", () => {
  const store = readFileSync(new URL("../supabase/functions/payments/store.js", import.meta.url), "utf8");
  const used = [...store.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  const existing = new Set(["complete_refund", "complete_cancel_refund"]); // já existem no banco real (0019)
  for (const fn of used) assert.ok(existing.has(fn) || new RegExp(`function public\\.${fn}\\b`).test(sql), fn);
});
