// O servidor também exige a versão mínima do aceite (migrações 0222 e 0223). O mínimo do servidor tem de ser igual ao do app.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DOC_MIN_VERSION, LEGAL_VERSION, LEGAL_VERSION_HISTORY } from "../src/lib/legalCore.js";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const read = (f) => readFileSync(new URL(f, dir), "utf8");

// mesma regra de legal_version_rank() do banco
const rank = (v) => { const m = /^(\d{4})-(\d{2})-[a-z]+-(\d{1,5})$/.exec(v ?? ""); return m ? Number(m[1]) * 1e10 + Number(m[2]) * 1e5 + Number(m[3]) : null; };

test("todas as versões do histórico têm posição e a ordem do banco é a mesma da lista do app", () => {
  const ranks = LEGAL_VERSION_HISTORY.map(rank);
  assert.ok(ranks.every((r) => r !== null));
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
  assert.equal(rank("antiga"), null);
});

test("o último mínimo gravado nas migrações é o mesmo DOC_MIN_VERSION do app", () => {
  const withMin = files.filter((f) => /insert into public\.legal_min_version/.test(read(f)));
  assert.ok(withMin.length >= 2);
  const last = read(withMin.at(-1));
  for (const doc of ["termos_cliente", "termos_casa"]) {
    const m = new RegExp(`'${doc}', '([^']+)'`).exec(last);
    assert.ok(m, `${doc} na última migração do mínimo`);
    assert.equal(m[1], DOC_MIN_VERSION[doc], `${doc}: servidor × app`);
  }
  assert.ok(rank(LEGAL_VERSION) >= rank(DOC_MIN_VERSION.termos_cliente));
});

test("compra do cliente e venda da casa passam pela conferência de versão, e a tabela do mínimo é fechada", () => {
  const s = read("0222_aceite_vigente_exigido_no_servidor.sql");
  assert.match(s, /create or replace function public\.has_client_terms[\s\S]*legal_accepted_current\(p_user, 'termos_cliente'\)/);
  assert.match(s, /create or replace function public\.house_accepted_terms[\s\S]*legal_accepted_current\(p_owner, 'termos_casa'\)/);
  assert.match(s, /alter table public\.legal_min_version enable row level security/);
  assert.match(s, /revoke all on table public\.legal_min_version from public, anon, authenticated/);
  assert.match(s, /revoke all on function public\.legal_accepted_current\(uuid, text\) from public, anon, authenticated/);
  // nenhuma migração posterior volta a definir has_client_terms sem a conferência de versão (nova compra do cliente)
  for (const f of files.filter((f) => f > "0222")) {
    const t = read(f);
    if (/create or replace function public\.has_client_terms/.test(t)) assert.match(t, /legal_accepted_current/, `${f} redefine has_client_terms sem a conferência de versão`);
  }
});

test("modelo do advogado: a casa com aceite antigo não trava a compra do cliente (0224)", () => {
  const s = read("0224_aceite_da_casa_nao_trava_cliente.sql");
  assert.match(s, /create or replace function public\.house_accepted_terms[\s\S]*doc_key = 'termos_casa'/);
  assert.doesNotMatch(s.replace(/--.*$/gm, ""), /legal_accepted_current/, "house_accepted_terms não pode exigir versão mínima");
  assert.match(s, /grant execute on function public\.house_accepted_terms\(uuid\) to authenticated/);
});
