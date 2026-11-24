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

const sql2 = readFileSync(new URL("../supabase/migrations/0198_sinal_mesmo_documento.sql", import.meta.url), "utf8");

test("mesmo CPF/CNPJ é sinal forte, comparado por dentro da função, e o número nunca sai", () => {
  assert.match(sql2, /'documento'::text/);
  assert.match(sql2, /pr\.sinais && array\['aparelho','documento'\]/);
  assert.match(sql2, /pgp_sym_decrypt\(t\.doc_enc, public\.tax_id_key\(\)\)/);
  const saida = sql2.split("select s.me")[1];
  assert.doesNotMatch(saida, /pgp_sym_decrypt|doc_enc|\bd\b ?,/);
});

test("a função continua restrita ao admin e não coleta nada novo", () => {
  assert.match(sql2, /admin_can\('comunicacao'\)/);
  assert.doesNotMatch(sql2, /create table|alter table|insert into/i);
});
