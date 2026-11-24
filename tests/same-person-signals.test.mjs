import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0197_sinais_de_mesma_pessoa.sql", import.meta.url), "utf8");

test("só o admin com permissão vê os sinais", () => {
  assert.match(sql, /admin_can\('comunicacao'\)/);
  assert.match(sql, /revoke all on function public\.admin_same_person_signals\(\) from public, anon/);
});

test("IP de rede usada por muitas contas é ignorado e o IP vencido não conta", () => {
  assert.match(sql, /p\.n <= 10/);
  assert.match(sql, /l\.purge_after > now\(\)/);
});

test("o IP nunca sai na resposta e o nível forte exige aparelho igual ou contas criadas em até 14 dias", () => {
  assert.doesNotMatch(sql.split("return query")[1].split("from sides s")[0], /'ip'/);
  assert.match(sql, /'aparelho' = any\(pr\.sinais\)/);
  assert.match(sql, /<= 14 \* 86400/);
});

test("não coleta nada novo: só lê tabelas que já existem", () => {
  assert.doesNotMatch(sql, /create table|alter table|insert into/i);
});
