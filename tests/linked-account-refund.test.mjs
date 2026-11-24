import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0196_conta_vinculada_reembolso.sql", import.meta.url), "utf8");

test("outras contas com e-mail em comum só contam dentro do prazo de retenção e nunca a própria conta", () => {
  assert.match(sql, /l2\.user_id <> l1\.user_id/);
  assert.match(sql, /l1\.retain_until > now\(\) and l2\.retain_until > now\(\)/);
});

test("o reembolso só é negado quando a outra conta já usou (pendente ou concluído) e inclui contas excluídas e ativas", () => {
  assert.match(sql, /account_prior_deleted\(h\.owner_id\)/);
  assert.match(sql, /account_linked_others\(h\.owner_id\)/);
  assert.match(sql, /r\.status in \('pendente', 'concluido'\)/);
});

test("a lista do admin exige permissão e a função de vínculo não é chamável pelo cliente", () => {
  assert.match(sql, /admin_can\('comunicacao'\)/);
  assert.match(sql, /revoke all on function public\.account_linked_others\(uuid\)[^;]*from authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.account_linked_others/);
});

test("a lista do admin mostra o e-mail mascarado", () => {
  assert.match(sql, /left\(split_part\(u\.email, '@', 1\), 2\) \|\| '\*\*\*@'/);
});
