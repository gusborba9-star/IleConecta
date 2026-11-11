// Verificação LOCAL da Fase 3 — jornada 1 (visitante descobre casa e oferta pública) num PostgreSQL 16: aplica 0001–0077 e ataca (o que o visitante vê e o que nunca vê).
// Uso: node supabase/verify/verify_fase3_visitante.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf3vis";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 77).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0077 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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





const DESC = "Descrição longa o suficiente para passar na validação mínima de descrição do ritual coletivo.";
const ev = async (title, status) => (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,$2,$3,5000,5, now() + interval '3 days', $4, 60) returning id`, [HID, title, DESC, status])).rows[0].id;
const E = { pub: await ev("Publicado", "publicado"), draft: await ev("Rascunho", "rascunho"), canc: await ev("Cancelado", "cancelado"), enc: await ev("Encerrado", "encerrado") };
await su.query(`insert into event_secrets(event_id,stream_url) values ($1,'https://exemplo.com/secreto')`, [E.pub]);
const svc = async (title, active, listed) => (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,listed,delivery,bookable,duration_min) values ($1,'trabalho',$2,'Descrição longa o suficiente para o serviço ser válido e aceito.',10000,$3,$4,'transmissao',true,60) returning id`, [HID, title, active, listed])).rows[0].id;
const S = { pub: await svc("Serviço público", true, true), priv: await svc("Serviço privado", true, false), off: await svc("Serviço pausado", false, true) };
await su.query(`insert into reservations(event_id,user_id,status,expires_at) values ($1,$2,'confirmada',now())`, [E.pub, U.C]);
const vis = (sql, p) => as("anon", null, (c) => q(c, sql, p));

let x = await vis(`select title from events order by title`);
ok("visitante vê ritual publicado e encerrado", x.rows?.some((r) => r.title === "Publicado") && x.rows?.some((r) => r.title === "Encerrado"), JSON.stringify(x.rows?.map((r) => r.title)));
ok("visitante NÃO vê rascunho nem ritual cancelado", !x.rows?.some((r) => ["Rascunho", "Cancelado"].includes(r.title)));
x = await vis(`select title from services order by title`);
ok("visitante vê só o serviço ativo e público", x.rows?.length === 1 && x.rows[0].title === "Serviço público", JSON.stringify(x.rows?.map((r) => r.title)));
ok("visitante NÃO vê serviço privado", !x.rows?.some((r) => r.title === "Serviço privado"));
ok("visitante NÃO vê serviço pausado", !x.rows?.some((r) => r.title === "Serviço pausado"));
x = await vis(`select * from event_secrets`); ok("visitante NÃO lê o link secreto do ritual", !x.err && x.rows.length === 0, x.err ?? `${x.rows?.length}`);
x = await vis(`select * from reservations`); ok("visitante NÃO lê reservas", !x.err && x.rows.length === 0, x.err ?? `${x.rows?.length}`);
x = await vis(`select * from service_orders`); ok("visitante NÃO lê pedidos", !x.err && x.rows.length === 0, x.err ?? `${x.rows?.length}`);
x = await vis(`select * from messages`); ok("visitante NÃO lê mensagens", !x.err && x.rows.length === 0, x.err ?? `${x.rows?.length}`);
x = await vis(`select id from profiles where account_type='cliente'`); ok("visitante NÃO lê perfis de clientes", !x.err && x.rows.length === 0, x.err ?? `${x.rows?.length}`);
x = await vis(`select id from houses`); ok("visitante vê as casas (vitrine pública)", !x.err && x.rows.length === 2, x.err ?? "");
x = await vis(`select * from service_for_chat($1)`, [S.priv]); ok("ataque: visitante não obtém o serviço privado pelo chat", Boolean(x.err) || x.rows.length === 0);
x = await vis(`select * from available_slots($1, current_date, 7)`, [S.priv]); ok("ataque: visitante não vê horários do privado", Boolean(x.err) || x.rows.length === 0);
x = await vis(`select reserve_event($1,'{}'::jsonb)`, [E.pub]); ok("ataque: visitante não reserva ritual", Boolean(x.err), x.err ?? "reservou");
x = await vis(`select create_service_order($1,'x')`, [S.pub]); ok("ataque: visitante não contrata serviço", Boolean(x.err), x.err ?? "contratou");
x = await vis(`update services set price_cents=1 where id=$1`, [S.pub]); ok("ataque: visitante não altera preço", x.n === 0 || Boolean(x.err), x.err ?? `${x.n}`);
x = await vis(`insert into posts(house_id,content,kind) values ($1,'spam','geral')`, [HID]); ok("ataque: visitante não publica", Boolean(x.err), x.err ?? "publicou");
x = await as("authenticated", U.C2, (c) => q(c, `select title from services order by title`)); ok("cliente sem oferta também NÃO vê o serviço privado na lista", !x.rows?.some((r) => r.title === "Serviço privado"));
x = await as("authenticated", U.H, (c) => q(c, `select title from services order by title`)); ok("a própria casa vê tudo (inclusive privado e pausado)", x.rows?.length === 3, JSON.stringify(x.rows?.map((r) => r.title)));
x = await as("authenticated", U.H2, (c) => q(c, `select title from services order by title`)); ok("outra casa NÃO vê o privado nem o pausado", x.rows?.length === 1);
await su.end();
console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);
