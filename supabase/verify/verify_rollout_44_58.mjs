// Verificação LOCAL: os passos de produção 44–58 (arquivos do SQL Editor) produzem exatamente o mesmo banco que as migrations 0078–0081,
// e podem ser repetidos sem erro. Compara funções, tabelas/colunas, índices, políticas, gatilhos, permissões e agendamentos.
// Uso: node supabase/verify/verify_rollout_44_58.mjs   (PG em 127.0.0.1:5544)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const SETUP = `alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on tables to service_role;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;`;
const strip = (s) => s.replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, "");
const mk = async (db) => { const a = await admin(); await a.query(`drop database if exists ${db} with (force)`); await a.query(`create database ${db}`); await a.end(); const c = await connect(db); await c.query(STUBS); await c.query(SETUP); return c; };
const migs = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const passos = readdirSync(ROLL).filter((f) => /^passo-(4[4-9]|5[0-8])\.sql$/.test(f)).sort();
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };

const A = await mk("vr_a"); const B = await mk("vr_b");
for (const f of migs.filter((f) => Number(f.slice(0, 4)) <= 81)) await A.query(strip(readFileSync(MIG + f, "utf8")));
for (const f of migs.filter((f) => Number(f.slice(0, 4)) <= 77)) await B.query(strip(readFileSync(MIG + f, "utf8")));
ok("encontrou 15 passos (44–58)", passos.length === 15, passos.join(","));
const errs = [];
for (const p of passos) { try { await B.query(strip(readFileSync(ROLL + p, "utf8"))); } catch (e) { errs.push(`${p}: ${e.message}`); } }
ok("passos 44–58 rodam em ordem, cada um sozinho, sem erro", errs.length === 0, errs.join(" | "));
const errs2 = [];
for (const p of passos) { try { await B.query(strip(readFileSync(ROLL + p, "utf8"))); } catch (e) { errs2.push(`${p}: ${e.message}`); } }
ok("rodar tudo de novo não dá erro (idempotente)", errs2.length === 0, errs2.join(" | "));

const SNAP = {
  funcoes: `select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def, p.prosecdef sec, coalesce(array_to_string(p.proconfig, ','), '') cfg from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
  permfunc: `select p.oid::regprocedure::text sig, r.rolname, has_function_privilege(r.oid, p.oid, 'execute') x from pg_proc p cross join (select oid, rolname from pg_roles where rolname in ('anon','authenticated','service_role')) r where p.pronamespace = 'public'::regnamespace order by 1,2`,
  colunas: `select table_name, column_name, data_type, is_nullable, coalesce(column_default,'') d from information_schema.columns where table_schema = 'public' order by 1, ordinal_position`,
  restricoes: `select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace order by 1,2`,
  indices: `select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`,
  politicas: `select schemaname, tablename, policyname, cmd, roles::text, coalesce(qual,'') q, coalesce(with_check,'') w from pg_policies order by 1,2,3`,
  gatilhos: `select event_object_table t, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema = 'public' order by 1,2,4`,
  permtab: `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','service_role') order by 1,2,3`,
  rls: `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`,
};
for (const [k, sql] of Object.entries(SNAP)) {
  const a = JSON.stringify((await A.query(sql)).rows), b = JSON.stringify((await B.query(sql)).rows);
  let why = "";
  if (a !== b) { const ra = JSON.parse(a), rb = JSON.parse(b); const sa = new Set(ra.map((x) => JSON.stringify(x))), sb = new Set(rb.map((x) => JSON.stringify(x))); why = `só-migrations: ${[...sa].filter((x) => !sb.has(x)).slice(0, 2).join(" || ")} | só-passos: ${[...sb].filter((x) => !sa.has(x)).slice(0, 2).join(" || ")}`; }
  ok(`idêntico: ${k}`, a === b, why);
}
try {
  const ja = (await A.query(`select jobname, schedule, command from cron.job order by 1`)).rows, jb = (await B.query(`select jobname, schedule, command from cron.job order by 1`)).rows;
  ok("idêntico: agendamentos (cron)", JSON.stringify(ja) === JSON.stringify(jb), `${ja.length} x ${jb.length}`);
} catch (e) { console.log("(cron não simulado:", e.message.slice(0, 60), ")"); }
await A.end(); await B.end();
// ---------- reversões: aplicar 0081→0078 num banco completo devolve o estado das migrations ≤ 0077
const R = new URL("../rollback/", import.meta.url).pathname;
const C = await mk("vr_c");
for (const f of migs.filter((f) => Number(f.slice(0, 4)) <= 81)) await C.query(strip(readFileSync(MIG + f, "utf8")));
const rerr = [];
for (const n of ["0081", "0080", "0079", "0078"]) { try { await C.query(strip(readFileSync(R + `${n}_reversao.sql`, "utf8"))); } catch (e) { rerr.push(`${n}: ${e.message}`); } }
ok("reversões 0081→0078 rodam sem erro", rerr.length === 0, rerr.join(" | "));
const D = await mk("vr_d");
for (const f of migs.filter((f) => Number(f.slice(0, 4)) <= 77)) await D.query(strip(readFileSync(MIG + f, "utf8")));
for (const [k, sql] of Object.entries(SNAP)) {
  const a = JSON.stringify((await D.query(sql)).rows), b = JSON.stringify((await C.query(sql)).rows);
  let why = ""; if (a !== b) { const sa = new Set(JSON.parse(a).map((x) => JSON.stringify(x))), sb = new Set(JSON.parse(b).map((x) => JSON.stringify(x))); why = `faltou: ${[...sa].filter((x) => !sb.has(x)).slice(0, 2).join(" || ")} | sobrou: ${[...sb].filter((x) => !sa.has(x)).slice(0, 2).join(" || ")}`; }
  ok(`após reverter, idêntico ao estado 0077: ${k}`, a === b, why);
}
const rerr2 = [];
for (const n of ["0081", "0080", "0079", "0078"]) { try { await C.query(strip(readFileSync(R + `${n}_reversao.sql`, "utf8"))); } catch (e) { rerr2.push(`${n}: ${e.message}`); } }
ok("reverter de novo também não dá erro", rerr2.length === 0, rerr2.join(" | "));
const cron = readdirSync(ROLL).filter((f) => /^passo-(4[4-9]|5[0-8])\.sql$/.test(f)).map((f) => readFileSync(ROLL + f, "utf8")).join("\n");
for (const j of ["purge-support-cases", "purge-deleted-identities", "run-account-deletions", "purge-conecta-calls"]) ok(`agendamento ${j} está nos passos`, cron.includes(`'${j}'`));
await C.end(); await D.end();

console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);
