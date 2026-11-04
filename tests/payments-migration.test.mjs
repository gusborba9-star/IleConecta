// EXEC-01 — garantias estáticas da migração 0064 (a execução real foi verificada em Postgres local; ver PR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0064_payment_provider_decoupling.sql", import.meta.url), "utf8");

test("0064: só adiciona; não derruba nem reescreve o que existe", () => {
  // únicos drops permitidos: as 3 funções novas deste PR (assinatura mudou antes de qualquer aplicação) e o próprio gatilho
  const drops = [...sql.matchAll(/\bdrop\s+(table|column|index|constraint|function|trigger)\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " "));
  assert.deepEqual(drops.filter((d) => !/^drop function if exists public\.(acquire_stripe_event|finish_stripe_event|payments_missing_processor_fee)\(/i.test(d) && !/^drop trigger if exists payments_guard_identity /i.test(d)), []);
  assert.ok(!/create or replace function public\.record_processor_fee\s*\(/i.test(sql)); // função viva da tarifa não é reescrita
  // `delete from payouts` existe no corpo VIVO de complete_refund (preservado); fora dele, a migração não apaga dados.
  const low = sql.toLowerCase();
  const outside = sql.slice(0, low.indexOf("function public.complete_refund")) + sql.slice(low.indexOf("function public.complete_cancel_refund"));
  assert.ok(!/\b(delete\s+from|truncate)\b/i.test(outside));
  // única escrita em dados existentes: marcar histórico Stripe sem conta (uma vez, junto com a criação da coluna)
  const updates = [...sql.matchAll(/^\s*update public\.payments set identity_strict = false/gim)];
  assert.equal(updates.length, 1);
  assert.ok(/add column if not exists locked_until/i.test(sql));
});

test("0064: funções sensíveis exigem service_role e não são públicas", () => {
  for (const fn of ["acquire_stripe_event", "finish_stripe_event", "confirm_payment_row", "confirm_payment_for", "record_processor_fee_for", "payments_missing_processor_fee", "payment_recorded_amounts"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(.*\\) from public, anon, authenticated`), fn);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(.*\\) to service_role`), fn);
  }
  assert.equal((sql.match(/auth\.role\(\)/g) ?? []).length >= 7, true);
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

test("0064: finish só pelo dono da trava (token) e aquisição devolve token", () => {
  assert.match(sql, /create or replace function public\.finish_stripe_event\(p_id text, p_token uuid, p_outcome text/i);
  assert.equal((sql.match(/lease_token = p_token and processed_at is null/g) ?? []).length, 3); // done, rejected e retry exigem o token
  assert.match(sql, /returns table \(outcome text, lease_token uuid\)/i);
});

test("0064: confirmação por id da linha travada, sem depender de provider_ref único", () => {
  assert.match(sql, /create or replace function public\.confirm_payment_row\(p_payment uuid\)/i);
  assert.match(sql, /select \* into pay from public\.payments where id = p_payment for update;/i);
  const row = sql.slice(sql.indexOf("confirm_payment_row(p_payment uuid)"), sql.indexOf("Compatibilidade: confirm_payment(ref)"));
  assert.ok(!/where provider_ref = /i.test(row), "corpo por id não pode buscar por provider_ref");
  const forFn = sql.slice(sql.indexOf("function public.confirm_payment_for"), sql.indexOf("-- ============ 4)"));
  assert.match(forFn, /for update/i);
  assert.match(forFn, /confirm_payment_row\(pay\.id\)/);
  assert.ok(!/confirm_payment\(p_provider_ref\)/.test(forFn));
  assert.match(sql, /Referência de pagamento ambígua/);
});

test("0064: identidade estrita para novos e histórico marcado uma única vez", () => {
  assert.match(sql, /add column identity_strict boolean not null default true/i);
  assert.match(sql, /set identity_strict = false\s+where provider = 'stripe' and stripe_account_id is null and provider_ref is not null/i);
  assert.match(sql, /else p\.identity_strict = false end/i);
});

test("0064: estorno usa o ledger registrado e nunca recalcula pela regra atual", () => {
  const low = sql.toLowerCase();
  const refund = sql.slice(low.indexOf("function public.complete_refund"), low.indexOf("function public.complete_cancel_refund"));
  const cancel = sql.slice(low.indexOf("function public.complete_cancel_refund"), low.indexOf("-- ============ 6)"));
  for (const body of [refund, cancel]) {
    assert.match(body, /payment_recorded_amounts\(pay\.id\)/);
    assert.ok(!/public\.fee_cents\(/.test(body), "estorno não pode recalcular a comissão pela regra atual");
    assert.ok(!/-pay\.gross_cents/.test(body));
  }
  assert.match(sql, /Comissão registrada não encontrada para o estorno/);
});
