// Verificação LOCAL da Fase 3 — Suporte: rotinas de suporte (0080) com a função de borda real (core.js) num PostgreSQL 16: aplica 0001–0080 e ataca (exclusão ponta a ponta (banco + acesso + arquivos), fila de repetição, limpeza de provas).
// Uso: node supabase/verify/verify_0080.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { runDeletions, runAdminAction } from "../functions/support-admin/core.js";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf0080";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 80).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0080 aplicadas sem erro", failed.length === 0, failed.join(" | "));
const as = async (role, uid, fn) => { const c = await connect(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const U = { H: "a0000000-0000-0000-0000-00000000000a", C: "c0000000-0000-0000-0000-00000000000c", C2: "c2000000-0000-0000-0000-0000000000c2", X: "e0000000-0000-0000-0000-00000000000e", H2: "b0000000-0000-0000-0000-00000000000b" };
const HID = "aa000000-0000-0000-0000-0000000000aa", HID2 = "bb000000-0000-0000-0000-0000000000bb";
for (const [k, id] of Object.entries(U)) {
  await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, k + "@x"]);
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
await su.query(`insert into profiles(id,account_type,display_name) values ($1,'cliente','Admin') on conflict (id) do nothing`, [A]);
await su.query(`insert into admins(user_id) values ($1)`, [A]);
const call = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));
const named = (name, args) => { const keys = Object.keys(args ?? {}); return { sql: `select * from public.${name}(${keys.map((k, i) => `${k} := $${i + 1}${/^p_(items)$/.test(k) ? "::jsonb" : ""}`).join(", ")})`, vals: keys.map((k) => (typeof args[k] === "object" && args[k] !== null && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : Array.isArray(args[k]) && k !== "p_ids" ? JSON.stringify(args[k]) : args[k])) }; };
const rpcAs = (role) => async (name, args) => {
  const { sql, vals } = named(name, args);
  const x = await as(role, null, (c) => q(c, sql, vals));
  if (x.err) throw new Error(x.err);
  if (x.rows.length === 1 && Object.keys(x.rows[0]).length === 1 && Object.keys(x.rows[0])[0] === name) return x.rows[0][name];
  return x.rows;
};

// ---------- permissões
for (const fn of ["support_log_action(uuid,uuid,text,text,jsonb)", "support_files_pending(integer)", "support_files_queue(jsonb)", "support_files_done(uuid[])", "auth_cleanup_pending_list(integer)", "auth_cleanup_mark(uuid,boolean,text)", "anonymize_account_and_queue(uuid,uuid)"]) {
  ok(`ACL ${fn.split("(")[0]}: só o servidor executa`, !(await priv("anon", `public.${fn}`)) && !(await priv("authenticated", `public.${fn}`)) && (await priv("service_role", `public.${fn}`)));
}

// ---------- semeadura: cliente com pedido encerrado, arquivos e pedido de exclusão vencido
const SV = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Trabalho X','Descrição longa o suficiente para o serviço ser válido e aceito.',10000,true,'transmissao',true,60) returning id`, [HID])).rows[0].id;
const ORD = (await su.query(`insert into service_orders(service_id,house_id,client_id,title,price_cents,status) values ($1,$2,$3,'Trabalho X',10000,'concluido') returning id`, [SV, HID, U.C])).rows[0].id;
await su.query(`insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',10000,'confirmado','v2-2026-10',1000,now(),'pix')`, [ORD]);
const CONV = (await su.query(`insert into conversations default values returning id`)).rows[0].id;
await su.query(`insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)`, [CONV, U.C, U.H]);
await su.query(`insert into messages(conversation_id,sender_id,text,attachment_path,attachment_type,attachment_name,attachment_size) values ($1,$2,'foto do documento',$3,'image/png','foto.png',100)`, [CONV, U.C, `${CONV}/foto.png`]);
await su.query(`insert into storage.objects(bucket_id,name,owner) values ('report-evidence',$1,$2)`, [`${U.C}/prova.png`, U.C]);
r = await call(U.C, `select request_account_deletion('EXCLUIR') id`); const REQ = r.rows[0].id;
await su.query(`update account_deletion_requests set execute_after = now() - interval '1 minute' where id=$1`, [REQ]);

// ---------- exclusão ponta a ponta com a função de borda real
const authCalls = [], removed = [];
let authFail = true;
const authAdmin = { updateUserById: async (id, attrs) => { authCalls.push([id, attrs]); return { error: authFail ? { message: "auth fora do ar" } : null }; } };
const storage = { remove: async (bucket, paths) => { removed.push([bucket, [...paths]]); await su.query(`delete from storage.objects where bucket_id=$1 and name = any($2)`, [bucket, paths]); return { error: null }; } };
const deps = { rpc: rpcAs("service_role"), authAdmin, storage, randomPassword: () => "x".repeat(40) };
let out = await runDeletions(deps);
ok("rodada 1: a conta foi anonimizada no banco mesmo com o login fora do ar", out.anonimizadas === 1 && (await su.query(`select display_name from profiles where id=$1`, [U.C])).rows[0].display_name === "Conta excluída", JSON.stringify(out));
ok("rodada 1: a falha do login ficou registrada para repetir", out.acessos_fechados === 0 && out.falhas.some((f) => f.etapa === "acesso") && Number((await su.query(`select attempts from auth_cleanup_pending where user_id=$1`, [U.C])).rows[0].attempts) === 1);
ok("rodada 1: os arquivos foram apagados do armazenamento e a fila esvaziou", out.arquivos_apagados >= 2 && removed.some((x) => x[0] === "chat-files" && x[1].some((pp) => pp.endsWith("/foto.png"))) && removed.some((x) => x[0] === "report-evidence") && Number((await su.query(`select count(*)::int n from support_files_to_remove`)).rows[0].n) === 0, JSON.stringify(out));
ok("rodada 1: a anonimização NÃO foi repetida (pedido já executado)", (await su.query(`select status from account_deletion_requests where id=$1`, [REQ])).rows[0].status === "executada");
authFail = false;
out = await runDeletions(deps);
ok("rodada 2: o login é fechado (e-mail inválido + bloqueio)", out.acessos_fechados === 1 && out.anonimizadas === 0 && authCalls.at(-1)[1].ban_duration === "876000h" && /@invalid\.local$/.test(authCalls.at(-1)[1].email), JSON.stringify(out));
ok("rodada 2: a fila de login esvaziou", Number((await su.query(`select count(*)::int n from auth_cleanup_pending`)).rows[0].n) === 0);
const n0 = authCalls.length;
out = await runDeletions(deps);
ok("rodada 3: nada a fazer, nada repetido", out.anonimizadas === 0 && out.acessos_fechados === 0 && out.arquivos_apagados === 0 && authCalls.length === n0, JSON.stringify(out));
ok("os registros financeiros e os aceites seguem de pé", Number((await su.query(`select count(*)::int n from payments`)).rows[0].n) === 1 && Number((await su.query(`select count(*)::int n from legal_consents where user_id=$1`, [U.C])).rows[0].n) >= 2);

// ---------- limpeza de provas de chamados vencidos
await su.query(`insert into storage.objects(bucket_id,name,owner) values ('report-evidence',$1,$2)`, [`${U.C2}/p2.png`, U.C2]);
r = await call(U.C2, `select open_support_case('duvida','Dúvida com prova','Tenho uma dúvida sobre minha conta aqui.') id`); const CS = r.rows[0].id;
r = await call(U.C2, `select submit_support_evidence($1,$2,'print',true)`, [CS, `${U.C2}/p2.png`]); ok("prova enviada ao chamado", !r.err, r.err ?? "");
await call(A, `select admin_support_decide($1,'orientacao','Orientada sobre o uso da plataforma e encerrado.')`, [CS]);
await su.query(`update support_cases set purge_after = now() - interval '1 day' where id=$1`, [CS]);
await su.query(`select purge_support_cases()`);
ok("chamado vencido apagado e a prova entrou na fila de remoção", Number((await su.query(`select count(*)::int n from support_files_to_remove where path=$1`, [`${U.C2}/p2.png`])).rows[0].n) === 1);
out = await runDeletions(deps);
ok("a rotina apaga a prova do armazenamento e esvazia a fila", out.arquivos_apagados === 1 && removed.some((x) => x[1].includes(`${U.C2}/p2.png`)) && Number((await su.query(`select count(*)::int n from support_files_to_remove`)).rows[0].n) === 0, JSON.stringify(out));

// ---------- registro de ações da função de borda
await rpcAs("service_role")("support_log_action", { p_case: null, p_actor: A, p_action: "conta_send_password_reset", p_reason: "Pessoa pediu no chamado", p_data: { usuario: U.C2 } });
ok("registro da função de borda gravado com quem, o quê, por quê", (await su.query(`select actor, reason from support_case_log where action='conta_send_password_reset'`)).rows[0]?.actor === A);
r = await call(U.C2, `select support_log_action(null,$1,'falsa','x','{}'::jsonb)`, [A]); ok("ataque: cliente não grava no registro de suporte", Boolean(r.err));

// ---------- ação do administrador com o banco real (is_admin de verdade)
const adminDeps = (uid) => ({ isAdmin: async () => (await su.query(`select exists(select 1 from admins where user_id=$1) x`, [uid])).rows[0].x, actorId: uid,
  authAdmin: { getUserById: async (id) => ({ data: { user: { id, email: "pessoa@exemplo.com", email_confirmed_at: "2026-01-01" } }, error: null }) },
  authPublic: { resetPasswordForEmail: async () => ({ error: null }), resend: async () => ({ error: null }) }, rpc: rpcAs("service_role") });
await runAdminAction(adminDeps(A), { action: "send_password_reset", user_id: U.C2, reason: "Esqueci a senha, pediu pelo chamado", case_id: CS });
ok("administrador: ação registrada no log com o chamado", Number((await su.query(`select count(*)::int n from support_case_log where action='conta_send_password_reset' and reason like 'Esqueci%'`)).rows[0].n) === 1);
r = await runAdminAction(adminDeps(U.C2), { action: "send_password_reset", user_id: U.C, reason: "Tentando como cliente comum" }).then(() => null, (e) => e.status);
ok("ataque: cliente comum não usa a função de administração", r === 403, String(r));

// ---------- agendamento
ok("rotina horária das exclusões está agendada (migration)", /cron\.schedule\('run-account-deletions', '20 \* \* \* \*'/.test(readFileSync(MIG + "0080_rotinas_de_suporte.sql", "utf8")));

await su.end();
console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);
