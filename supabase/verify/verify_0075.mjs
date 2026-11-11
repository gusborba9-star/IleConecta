// Verificação LOCAL da 0075 (a assistente continua na passagem; lembretes até 2 h) num PostgreSQL 16: aplica 0001–0074, aplica a 0073 duas vezes e ataca
// (visibilidade, prova de oferta no chat, agenda única entre serviços, calendário com hora, permissões).
// Uso: node supabase/verify/verify_0075.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "v0075";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 74).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0074 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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


const sql75 = process.env.PASSOS ? readdirSync(ROLL).filter((f) => /^passo-3[89]\.sql$/.test(f)).sort().map((f) => readFileSync(ROLL + f, "utf8")).join("\n") : load("0075_assistente_continua_na_passagem.sql");
let e75 = null; try { await su.query(sql75); await su.query(sql75); } catch (e) { e75 = e.message; }
ok(`0075 ${process.env.PASSOS ? "(pelos passos) " : ""}aplica duas vezes sem erro (idempotente)`, e75 === null, e75 ?? "");

const CONV = (await as("authenticated", U.C, (c) => q(c, `select open_conversation($1) id`, [U.H]))).rows[0].id;
const CONV2 = (await as("authenticated", U.C2, (c) => q(c, `select open_conversation($1) id`, [U.H]))).rows[0].id;
const act = async (conv) => (await su.query(`select public.handoff_effective_active(h.state,h.updated_at,h.house_owner_id) a from conversation_handoff h where conversation_id=$1`, [conv])).rows[0]?.a;
const allows = async (conv) => (await su.query(`select public.handoff_allows_assistant($1,$2) a`, [conv, U.H])).rows[0].a;
const setAge = (conv, min, state = "pendente") => su.query(`update conversation_handoff set state=$2, updated_at = now() - make_interval(mins => $3), since = now() - make_interval(mins => $3) where conversation_id=$1`, [conv, state, min]);
const mark = async (conv) => (await su.query(`select public.handoff_mark_pending($1,$2,'teste') n`, [conv, U.H])).rows[0].n;
const notes = async () => (await su.query(`select n.text, n.href from notifications n where n.user_id=$1 and n.kind='handoff' and n.text like '%aguarda você%' order by n.created_at`, [U.H])).rows;
const remind = async () => (await su.query(`select public.handoff_remind() n`)).rows[0].n;
const ageEvents = (min) => su.query(`update handoff_events set created_at = now() - make_interval(mins => $1) where action='lembrete'`, [min]);
const clearAll = async () => { await su.query(`delete from notifications where user_id=$1`, [U.H]); await su.query(`delete from handoff_events where action='lembrete'`); };

// ---- a assistente continua enquanto a conversa está pendente
await mark(CONV);
ok("pendente recém-passado: a assistente PODE responder", (await allows(CONV)) === true && (await act(CONV)) === true);
await setAge(CONV, 90);
ok("pendente há 90 min: continua pendente e a assistente pode responder", (await act(CONV)) === true && (await allows(CONV)) === true);
await setAge(CONV, 121);
ok("pendente há mais de 2 h: o estado some, a assistente responde", (await act(CONV)) === false && (await allows(CONV)) === true);
await setAge(CONV, 1, "humano");
ok("humano (a casa atendendo): a assistente NÃO responde", (await act(CONV)) === true && (await allows(CONV)) === false);
await su.query(`update profiles set last_seen_at = now() - interval '1 hour' where id=$1`, [U.H]);
await setAge(CONV, 11, "humano");
ok("humano parado e casa offline: a assistente volta (passo 31 intacto)", (await act(CONV)) === false && (await allows(CONV)) === true);
await su.query(`update profiles set last_seen_at = now() where id=$1`, [U.H]);
await setAge(CONV, 30, "humano");
ok("humano com a casa online: a assistente continua calada", (await allows(CONV)) === false);
await setAge(CONV, 5, "automacao");
ok("automação: a assistente responde", (await allows(CONV)) === true);

// ---- a casa responde no chat enquanto pendente: vira humano e a assistente cala
await mark(CONV2);
ok("pendente em outra conversa: a assistente pode responder", (await allows(CONV2)) === true);
await su.query(`insert into messages(conversation_id,sender_id,text) values ($1,$2,'Já vou te atender')`, [CONV2, U.H]);
ok("a casa respondeu no chat: vira humano e a assistente cala", (await su.query(`select state from conversation_handoff where conversation_id=$1`, [CONV2])).rows[0].state === "humano" && (await allows(CONV2)) === false);

// ---- lembretes: 4 min nos 3 primeiros, depois 15 min, até 2 h
await clearAll(); await su.query(`delete from handoff_events where conversation_id=$1`, [CONV]);
await setAge(CONV, 3);
ok("lembrete: aos 3 min não envia", (await remind()) === 0);
await setAge(CONV, 5);
ok("lembrete 1: aos 5 min", (await remind()) === 1 && (await notes()).length === 1);
const n1 = (await notes())[0];
ok("lembrete: texto com nome, tempo e que a assistente continua; leva à conversa", /ainda aguarda você há 5 min\. A assistente continua atendendo/.test(n1.text) && n1.href === `/mensagens/${U.C}`, `${n1.text} | ${n1.href}`);
ok("lembrete: de novo logo depois não repete", (await remind()) === 0);
await ageEvents(5); await setAge(CONV, 9);
ok("lembrete 2: 4 min depois", (await remind()) === 1);
await ageEvents(5); await setAge(CONV, 13);
ok("lembrete 3: 4 min depois", (await remind()) === 1 && (await notes()).length === 3);
await ageEvents(5); await setAge(CONV, 18);
ok("depois do 3º o intervalo passa a 15 min: 5 min depois NÃO envia", (await remind()) === 0 && (await notes()).length === 3);
await ageEvents(16); await setAge(CONV, 29);
ok("lembrete 4: 16 min depois", (await remind()) === 1 && (await notes()).length === 4);
await ageEvents(16); await setAge(CONV, 75);
const n5 = (await remind()) === 1 ? (await notes()).at(-1).text : "";
ok("lembrete: texto em horas depois de 60 min", /há 1 h 15 min\./.test(n5), n5);
await ageEvents(16); await setAge(CONV, 119);
ok("lembrete: ainda envia aos 119 min", (await remind()) === 1);
await ageEvents(16); await setAge(CONV, 121);
ok("lembrete: passadas 2 h não envia mais", (await remind()) === 0);
await clearAll(); await setAge(CONV, 6, "humano");
ok("lembrete: casa atendendo (humano) não recebe", (await remind()) === 0);
await setAge(CONV, 6, "automacao");
ok("lembrete: devolvida à assistente não recebe", (await remind()) === 0);

// ---- passagem nova reinicia a contagem e o aviso
await su.query(`delete from handoff_events where conversation_id=$1`, [CONV]);
await mark(CONV);
ok("nova passagem dentro de 10 min NÃO avisa de novo", (await mark(CONV)) === false);
await su.query(`update handoff_events set created_at = now() - interval '11 minutes' where conversation_id=$1`, [CONV]);
ok("nova passagem depois de 10 min avisa de novo", (await mark(CONV)) === true);

// ---- permissões
ok("ACL: handoff_remind e handoff_allows_assistant só do servidor", !(await priv("authenticated", "public.handoff_remind()")) && !(await priv("anon", "public.handoff_remind()")) && !(await priv("authenticated", "public.handoff_allows_assistant(uuid,uuid)")) && (await priv("service_role", "public.handoff_allows_assistant(uuid,uuid)")));
r = await as("authenticated", U.C, (c) => q(c, `select public.handoff_remind()`)); ok("ataque: cliente não dispara lembretes", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, `select public.handoff_allows_assistant($1,$2)`, [CONV, U.H])); ok("ataque: cliente não consulta a função interna", Boolean(r.err), r.err);
console.log(bad ? `\n${bad} FALHA(S)` : "\nTODAS AS VERIFICAÇÕES PASSARAM");
await su.end(); process.exit(bad ? 1 : 0);
