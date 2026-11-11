// Verificação LOCAL da 0074 (pendente de 15 min e lembretes) num PostgreSQL 16: aplica 0001–0073, aplica a 0073 duas vezes e ataca
// (visibilidade, prova de oferta no chat, agenda única entre serviços, calendário com hora, permissões).
// Uso: node supabase/verify/verify_0074.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "v0074";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 73).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0073 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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

const sql74 = process.env.PASSOS ? readdirSync(ROLL).filter((f) => /^passo-3[6-9]\.sql$/.test(f)).sort().map((f) => readFileSync(ROLL + f, "utf8")).join("\n") : load("0074_pendente_15min_e_lembretes.sql");
let e74 = null; try { await su.query(sql74); await su.query(sql74); } catch (e) { e74 = e.message; }
ok(`0074 ${process.env.PASSOS ? "(pelos passos) " : ""}aplica duas vezes sem erro (idempotente)`, e74 === null, e74 ?? "");

const CONV = (await as("authenticated", U.C, (c) => q(c, `select open_conversation($1) id`, [U.H]))).rows[0].id;
const CONV2 = (await as("authenticated", U.C2, (c) => q(c, `select open_conversation($1) id`, [U.H]))).rows[0].id;
const act = async (conv) => (await su.query(`select public.handoff_effective_active(h.state,h.updated_at,h.house_owner_id) a from conversation_handoff h where conversation_id=$1`, [conv])).rows[0]?.a;
const allows = async (conv) => (await su.query(`select public.handoff_allows_assistant($1,$2) a`, [conv, U.H])).rows[0].a;
const setAge = (conv, min, state = "pendente") => su.query(`update conversation_handoff set state=$2, updated_at = now() - make_interval(mins => $3), since = now() - make_interval(mins => $3) where conversation_id=$1`, [conv, state, min]);
const mark = async (conv) => (await su.query(`select public.handoff_mark_pending($1,$2,'teste') n`, [conv, U.H])).rows[0].n;

// ---- validade do pendente
ok("mark_pending: a 1ª passagem avisa a casa", (await mark(CONV)) === true);
ok("pendente recém-passado: ativo e a assistente NÃO responde", (await act(CONV)) === true && (await allows(CONV)) === false);
await setAge(CONV, 14);
ok("pendente aos 14 min: ainda ativo", (await act(CONV)) === true && (await allows(CONV)) === false);
await setAge(CONV, 16);
ok("pendente aos 16 min: expirou, a assistente volta a atender", (await act(CONV)) === false && (await allows(CONV)) === true);
r = await as("authenticated", U.C, (c) => q(c, `select active from conversation_handoff_state($1)`, [CONV]));
ok("o cliente deixa de ver 'a casa foi avisada' depois de 15 min", r.rows?.[0]?.active === false, JSON.stringify(r.rows ?? r.err));
await setAge(CONV, 5, "humano");
ok("humano recente continua ativo (regra do passo 31 intacta)", (await act(CONV)) === true);
await su.query(`update profiles set last_seen_at = now() - interval '1 hour' where id=$1`, [U.H]);
await setAge(CONV, 11, "humano");
ok("humano parado e casa offline: a assistente volta (passo 31 intacto)", (await act(CONV)) === false);

// ---- aviso de nova passagem depois de expirar
await su.query(`delete from handoff_events where conversation_id=$1`, [CONV]);
await mark(CONV);
ok("nova passagem dentro de 10 min NÃO avisa de novo", (await mark(CONV)) === false);
await su.query(`update handoff_events set created_at = now() - interval '11 minutes' where conversation_id=$1`, [CONV]);
ok("nova passagem depois de 10 min avisa de novo", (await mark(CONV)) === true);

// ---- lembretes
const notes = async (conv) => (await su.query(`select n.text, n.href, n.kind from notifications n where n.user_id=$1 and n.kind='handoff' and n.text like '%aguarda você%' order by n.created_at`, [U.H])).rows;
const remind = async () => (await su.query(`select public.handoff_remind() n`)).rows[0].n;
const clearAll = async () => { await su.query(`delete from notifications where user_id=$1`, [U.H]); await su.query(`delete from handoff_events where action='lembrete'`); };
await clearAll();
await su.query(`delete from handoff_events where conversation_id=$1`, [CONV]);
await setAge(CONV, 3);
ok("lembrete: aos 3 min ainda não envia", (await remind()) === 0 && (await notes()).length === 0);
await setAge(CONV, 5);
ok("lembrete: aos 5 min envia 1 para a casa", (await remind()) === 1 && (await notes()).length === 1);
const n1 = (await notes())[0];
ok("lembrete: texto com nome, minutos e o que acontece depois; leva à conversa", /ainda aguarda você há 5 min/.test(n1.text) && /assistente volta a atender em 10 min/.test(n1.text) && n1.href === `/mensagens/${U.C}`, `${n1.text} | ${n1.href}`);
ok("lembrete: rodar de novo logo depois não repete", (await remind()) === 0 && (await notes()).length === 1);
await su.query(`update handoff_events set created_at = now() - interval '5 minutes' where action='lembrete'`); await setAge(CONV, 9);
ok("lembrete: 4 min depois envia o 2º", (await remind()) === 1 && (await notes()).length === 2);
await su.query(`update handoff_events set created_at = now() - interval '5 minutes' where action='lembrete'`); await setAge(CONV, 13);
ok("lembrete: envia o 3º", (await remind()) === 1 && (await notes()).length === 3);
await su.query(`update handoff_events set created_at = now() - interval '5 minutes' where action='lembrete'`);
ok("lembrete: no máximo 3 por passagem", (await remind()) === 0 && (await notes()).length === 3);
await clearAll(); await setAge(CONV, 16);
ok("lembrete: depois de expirar (16 min) não envia", (await remind()) === 0);
await setAge(CONV, 6, "humano");
ok("lembrete: casa já assumiu (humano) não recebe", (await remind()) === 0);
await setAge(CONV, 6, "automacao");
ok("lembrete: devolvida à assistente não recebe", (await remind()) === 0);

// ---- conversas independentes
await clearAll();
await mark(CONV2); await setAge(CONV2, 5); await setAge(CONV, 6, "automacao");
ok("lembrete: só a conversa pendente recebe (a outra, não)", (await remind()) === 1 && (await notes()).length === 1 && (await notes())[0].href === `/mensagens/${U.C2}`);

// ---- permissões
ok("ACL: handoff_remind só o servidor", !(await priv("anon", "public.handoff_remind()")) && !(await priv("authenticated", "public.handoff_remind()")) && (await priv("service_role", "public.handoff_remind()")));
ok("ACL: handoff_mark_pending e handoff_effective_active seguem só do servidor", !(await priv("authenticated", "public.handoff_mark_pending(uuid,uuid,text)")) && !(await priv("authenticated", "public.handoff_effective_active(text,timestamptz,uuid)")));
r = await as("authenticated", U.C, (c) => q(c, `select public.handoff_remind()`)); ok("ataque: cliente não dispara lembretes", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, `insert into handoff_events(conversation_id,house_owner_id,action) values ($1,$2,'lembrete')`, [CONV, U.H])); ok("ataque: cliente não grava eventos do atendimento", Boolean(r.err), r.err);
console.log(bad ? `\n${bad} FALHA(S)` : "\nTODAS AS VERIFICAÇÕES PASSARAM");
await su.end(); process.exit(bad ? 1 : 0);
