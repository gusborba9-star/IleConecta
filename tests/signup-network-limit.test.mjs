import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0199_limite_de_cadastros_por_rede.sql", import.meta.url), "utf8");
const code = sql.replace(/--.*$/gm, "");

test("0199: o gancho só pode ser chamado pela autenticação do Supabase", () => {
  assert.match(code, /revoke all on function public\.hook_before_user_created\(jsonb\) from public, anon, authenticated/);
  assert.match(code, /grant execute on function public\.hook_before_user_created\(jsonb\) to supabase_auth_admin/);
});

test("0199: guarda só um código irreversível da rede, com chave do servidor (nunca o IP)", () => {
  assert.match(code, /extensions\.digest\(v_net \|\| ':' \|\| v_salt, 'sha256'\)/);
  assert.match(code, /recovery_throttle_hit\('su:' \|\| v_key, 5\)/);
  assert.doesNotMatch(code, /insert into public\.(access_logs|recovery_throttle)/);
});

test("0199: IPv6 conta pelo bloco /64 com os bits de host zerados", () => {
  assert.match(code, /host\(network\(set_masklen\(v_ip::inet, case when family\(v_ip::inet\) = 6 then 64 else 32 end\)\)\)/);
});

test("0199: sem IP ou com qualquer falha o cadastro segue; a recusa é 429 com texto neutro", () => {
  assert.match(code, /if v_ip is null then return '\{\}'::jsonb; end if;/);
  assert.match(code, /exception when others then\s+return '\{\}'::jsonb;/);
  assert.match(code, /'http_code', 429/);
  assert.match(code, /Tente novamente mais tarde\./);
  assert.doesNotMatch(code, /ban|bloque|suspen/i);
});

test("a tela traduz a recusa do limite de rede sem culpar a pessoa", () => {
  const ts = readFileSync(new URL("../src/lib/remoteAuth.ts", import.meta.url), "utf8");
  assert.match(ts, /m\.includes\("cadastro a partir desta rede"\)/);
  assert.match(ts, /Tente novamente mais tarde ou use outra conexão\./);
  // a tradução do limite de rede vem antes da genérica de "muitas tentativas"
  assert.ok(ts.indexOf("cadastro a partir desta rede") < ts.indexOf('m.includes("too many")'));
});
