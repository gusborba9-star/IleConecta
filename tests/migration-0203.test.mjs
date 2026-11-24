import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const raw = readFileSync(new URL("../supabase/migrations/0203_leitura_de_arquivos_privados.sql", import.meta.url), "utf8");
const sql = raw.replace(/--.*$/gm, "");

test("0203: a política de provas de chamado não consulta mais a tabela fechada direto (era o que travava toda leitura do Storage)", () => {
  const pol = sql.split('create policy "evidence: admin lê provas de chamado"')[1].split(";")[0];
  assert.doesNotMatch(pol, /support_case_evidence/);
  assert.match(pol, /public\.admin_can\('suporte'\)/);
  assert.match(pol, /public\.support_evidence_visible\(name\)/);
});

test("0203: a função só responde para o módulo de suporte e não é chamável sem login", () => {
  assert.match(sql, /function public\.support_evidence_visible\(p_path text\) returns boolean[\s\S]*security definer/);
  assert.match(sql, /select public\.admin_can\('suporte'\) and exists \(select 1 from public\.support_case_evidence e where e\.path = p_path\)/);
  assert.match(sql, /revoke all on function public\.support_evidence_visible\(text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.support_evidence_visible\(text\) to authenticated/);
});

test("0203: o visitante sem login lê as configurações públicas; a chave do vídeo continua só da administração", () => {
  assert.match(sql, /create policy settings_read on public\.platform_settings for select using \(key <> 'video'\)/);
  const pub = sql.split("create policy settings_read on public.platform_settings")[1].split(";")[0];
  assert.doesNotMatch(pub, /is_admin/, "a política pública não pode chamar função: o papel anon não executa is_admin()");
  assert.match(sql, /create policy settings_read_video on public\.platform_settings for select to authenticated using \(key = 'video' and public\.is_admin\(\)\)/);
});

test("a falha ao gerar o link de um arquivo agora aparece em Saúde da plataforma, sem expor o caminho", () => {
  const ts = readFileSync(new URL("../src/lib/chatFiles.ts", import.meta.url), "utf8");
  assert.match(ts, /reportClientError\(new Error\(`link de arquivo falhou \(\$\{bucket\}\)/);
  assert.doesNotMatch(ts.split("link de arquivo falhou")[1].split("\n")[0], /path/);
});
