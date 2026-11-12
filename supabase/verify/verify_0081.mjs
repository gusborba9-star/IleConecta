// Verificação LOCAL da Fase 3 — Suporte: assistente Conecta (0081): limite de uso e contexto da própria conta num PostgreSQL 16: aplica 0001–0081 e ataca.
// Uso: node supabase/verify/verify_0081.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf0081";
const a = await admin(); await a.query(`drop database if exists ${DB} with (force)`); await a.query(`create database ${DB}`); await a.end();
const su = await connect(DB); await su.query(STUBS);
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on tables to service_role;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
  create table public.http_log (url text, body jsonb);
  create or replace function net.http_post(url text, body jsonb default null, headers jsonb default null) returns bigint language sql as $$ insert into public.http_log values (url, body) returning 1::bigint $$;`);
const load = (f) => readFileSync(MIG + f, "utf8").replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, "");
const failed = [];
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 81).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0081 aplicadas sem erro", failed.length === 0, failed.join(" | "));
const as = async (role, uid, fn) => { const c = await connect(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const U = { H: "a0000000-0000-0000-0000-00000000000a", C: "c0000000-0000-0000-0000-00000000000c", C2: "c2000000-0000-0000-0000-0000000000c2", X: "e0000000-0000-0000-0000-00000000000e", H2: "b0000000-0000-0000-0000-00000000000b" };
const HID = "aa000000-0000-0000-0000-0000000000aa", HID2 = "bb000000-0000-0000-0000-0000000000bb";
for (const [k, id] of Object.entries(U)) {
  await su.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())`, [id, k + "@x"]);
  await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name`, [id, ["H", "H2"].includes(k) ? "casa" : "cliente", "Pessoa " + k + " Teste"]);
}
await su.query("set session_replication_role = replica");
await su.query(`insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa H','casa-h','maximo'),($3,$4,'Casa H2','casa-h2','maximo')`, [HID, U.H, HID2, U.H2]);
await su.query("set session_replication_role = origin");
for (const u of [U.C, U.C2, U.X]) for (const d of ["termos_cliente", "dados_sensiveis"]) await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,$2,'x')`, [u, d]).catch(() => null);
await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_casa','x')`, [U.H]).catch(() => null);
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
for (const h of [HID, HID2]) for (let d = 0; d < 7; d++) await su.query(`insert into house_availability(house_id,weekday,start_time,end_time) values ($1,$2,'08:00','20:00')`, [h, d]);
let r;
const priv = async (role, sig) => (await su.query(`select has_function_privilege($1, $2, 'execute') x`, [role, sig])).rows[0].x;
const A = "ad000000-0000-0000-0000-0000000000ad";
await su.query(`insert into auth.users(id,email) values ($1,'adm@x')`, [A]);
await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Admin','Salvador') on conflict (id) do nothing`, [A]);
await su.query(`insert into admins(user_id) values ($1)`, [A]);
const call = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));
const svc = (sql, p) => as("service_role", null, (c) => q(c, sql, p));

// ---------- permissões
ok("ataque: cliente não chama conecta_allow", !(await priv("authenticated", "public.conecta_allow(uuid)")));
ok("ataque: visitante não chama conecta_allow nem lê o contexto", !(await priv("anon", "public.conecta_allow(uuid)")) && !(await priv("anon", "public.conecta_account_context()")));
ok("a função de borda (service_role) chama conecta_allow", await priv("service_role", "public.conecta_allow(uuid)"));
r = await call(U.C, `select * from conecta_calls`); ok("ataque: a tabela de uso não é lida direto", Boolean(r.err));
r = await call(U.C, `select conecta_allow($1)`, [U.C]); ok("ataque: pessoa logada não consegue se dar créditos nem gastar de outro", Boolean(r.err));

// ---------- limite 20/h e 80/dia
let allowed = 0; for (let i = 0; i < 25; i++) { r = await svc(`select conecta_allow($1) a`, [U.C]); if (r.rows?.[0]?.a) allowed++; }
ok("20 por hora e depois bloqueia", allowed === 20, String(allowed));
r = await svc(`select conecta_allow($1) a`, [U.C2]); ok("o limite é por pessoa (outra pessoa segue livre)", r.rows?.[0]?.a === true);
await su.query(`update conecta_calls set at = now() - interval '2 hours' where user_id=$1`, [U.C]);
r = await svc(`select conecta_allow($1) a`, [U.C]); ok("passada a hora, libera de novo", r.rows?.[0]?.a === true);
await su.query(`delete from conecta_calls where user_id=$1`, [U.X]);
await su.query(`insert into conecta_calls(user_id, at) select $1, now() - interval '3 hours' - (g || ' minutes')::interval from generate_series(1,80) g`, [U.X]);
r = await svc(`select conecta_allow($1) a`, [U.X]); ok("80 no dia bloqueia mesmo com a hora livre", r.rows?.[0]?.a === false);
await su.query(`update conecta_calls set at = now() - interval '4 days' where user_id=$1`, [U.X]);
r = await svc(`select purge_conecta_calls() n`); ok("limpeza apaga registros com mais de 3 dias", Number(r.rows?.[0]?.n) === 80 && Number((await su.query(`select count(*)::int n from conecta_calls where user_id=$1`, [U.X])).rows[0].n) === 0, JSON.stringify(r.rows));

// ---------- contexto da própria conta
r = await as("authenticated", null, (c) => q(c, `select conecta_account_context()`)); ok("sem login o contexto é recusado", Boolean(r.err));
r = await call(U.C, `select conecta_account_context() j`); const cx = r.rows?.[0]?.j;
ok("cliente: contexto básico, sem casa", cx && cx.tipo_conta === "cliente" && cx.casa === null && cx.suspensa === false && cx.chamados_abertos === 0, r.err ?? JSON.stringify(cx));
ok("o contexto não leva e-mail nem identificadores de terceiros", !JSON.stringify(cx).includes("@"));
r = await call(U.H, `select conecta_account_context() j`); ok("casa: nome e plano da própria casa", r.rows?.[0]?.j?.casa?.nome === "Casa H" && r.rows[0].j.casa.plano === "maximo", r.err ?? "");
r = await call(U.C2, `select conecta_account_context() j`); ok("cada pessoa vê só o seu (outro cliente não vê a casa)", r.rows?.[0]?.j?.casa === null);
r = await call(A, `select admin_suspend_account($1,'Teste de suspensão da conta')`, [U.C]); ok("(preparo) admin suspende", !r.err, r.err ?? "");
r = await call(U.C, `select conecta_account_context() j`); ok("conta suspensa aparece no contexto", r.rows?.[0]?.j?.suspensa === true);
r = await call(U.C, `select open_support_case('duvida','Dúvida sobre taxa','Quero entender a taxa da plataforma.',null,null,null,'assistente') id`); ok("chamado aberto pela assistente é aceito (origem 'assistente')", !r.err, r.err ?? "");
r = await call(U.C, `select conecta_account_context() j`); ok("contagem de chamados abertos sobe", r.rows?.[0]?.j?.chamados_abertos === 1);
r = await call(U.C, `select open_support_case('risco_vida','Possível risco à vida','Relato da pessoa à assistente: preciso de ajuda.',null,null,null,'assistente') id`); ok("risco de vida via assistente é aceito", !r.err, r.err ?? "");
ok("risco de vida nasce urgente", (await su.query(`select priority from support_cases where kind='risco_vida'`)).rows[0].priority === "urgente");
const exe = (await su.query(`select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'conecta%' or p.proname = 'purge_conecta_calls') and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)).rows.map((x) => x.proname);
ok("pessoas logadas executam só a leitura do próprio contexto (nenhuma função de escrita da assistente)", JSON.stringify(exe) === '["conecta_account_context"]', JSON.stringify(exe));

await su.end();
console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);
