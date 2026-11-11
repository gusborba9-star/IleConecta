// Verificação LOCAL da 0073 (agenda única e serviço privado) num PostgreSQL 16: aplica 0001–0072, aplica a 0073 duas vezes e ataca
// (visibilidade, prova de oferta no chat, agenda única entre serviços, calendário com hora, permissões).
// Uso: node supabase/verify/verify_0073.mjs   (PG em 127.0.0.1:5544; env PASSOS=1 aplica supabase/rollout/passo-32.. em vez da migration)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "v0073";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 72).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0072 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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
const DESC = "Descrição longa o suficiente para passar na validação mínima de descrição do serviço.";
const svc = async (house, kind, title, delivery, bookable, mins = 60) => (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,$2,$3,$4,20000,true,$5,$6,$7) returning id`, [house, kind, title, DESC, delivery, bookable, mins])).rows[0].id;
const S_PUB = await svc(HID, "buzios", "Jogo de búzios", "presencial", true);

// ---- antes da 0073: o tipo "trabalho" não podia ter agenda
let pre = await q(su, `insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Trabalho de amor',$2,20000,true,'transmissao',true,60)`, [HID, DESC]);
ok("pré-condição: antes da 0073, agenda em 'trabalho' é recusada", Boolean(pre.err), pre.err);

const sql73 = process.env.PASSOS ? readdirSync(ROLL).filter((f) => /^passo-3[2-9]\.sql$/.test(f)).sort().map((f) => readFileSync(ROLL + f, "utf8")).join("\n") : load("0073_agenda_unica_e_servico_privado.sql");
let e73 = null; try { await su.query(sql73); await su.query(sql73); } catch (e) { e73 = e.message; }
ok(`0073 ${process.env.PASSOS ? "(pelos passos) " : ""}aplica duas vezes sem erro (idempotente)`, e73 === null, e73 ?? "");

const S_PRIV = await svc(HID, "trabalho", "Trabalho de amor", "transmissao", true);
const S_PRIV_NB = await svc(HID, "limpeza", "Limpeza espiritual", "sigilo", false);
await su.query(`update services set listed=false where id in ($1,$2)`, [S_PRIV, S_PRIV_NB]);
const S_OTHER = await svc(HID2, "buzios", "Búzios da casa 2", "presencial", true);
await su.query(`update services set listed=false where id=$1`, [S_OTHER]);
ok("agenda vale para qualquer tipo de serviço (trabalho com agenda aceito)", (await su.query(`select bookable from services where id=$1`, [S_PRIV])).rows[0].bookable === true);

// ---- ACL
const priv = async (role, sig) => (await su.query(`select has_function_privilege($1, $2, 'execute') x`, [role, sig])).rows[0].x;
ok("ACL: service_offered_to_me ninguém de fora executa", !(await priv("anon", "public.service_offered_to_me(uuid)")) && !(await priv("authenticated", "public.service_offered_to_me(uuid)")));
ok("ACL: service_purchasable não é do anon", !(await priv("anon", "public.service_purchasable(uuid)")) && (await priv("authenticated", "public.service_purchasable(uuid)")));
ok("ACL: service_for_chat só authenticated", (await priv("authenticated", "public.service_for_chat(uuid)")) && !(await priv("anon", "public.service_for_chat(uuid)")));
ok("ACL: house_calendar_blocks só o servidor", !(await priv("anon", "public.house_calendar_blocks(uuid,date,date)")) && !(await priv("authenticated", "public.house_calendar_blocks(uuid,date,date)")) && (await priv("service_role", "public.house_calendar_blocks(uuid,date,date)")));

// ---- visibilidade do serviço privado
const ids = (r) => (r.rows ?? []).map((x) => x.id);
for (const [who, uid, role] of [["anon", null, "anon"], ["estranho", U.X, "authenticated"], ["cliente", U.C, "authenticated"]]) {
  const r = await as(role, uid, (c) => q(c, `select id from services`));
  ok(`${who} lê o serviço da página mas NÃO os privados`, ids(r).includes(S_PUB) && !ids(r).includes(S_PRIV) && !ids(r).includes(S_PRIV_NB), r.err ?? ids(r).length + " serviço(s)");
}
let r = await as("authenticated", U.H, (c) => q(c, `select id from services`));
ok("a casa dona vê todos os próprios serviços (inclusive privados)", ids(r).includes(S_PRIV) && ids(r).includes(S_PRIV_NB));
r = await as("authenticated", U.H2, (c) => q(c, `select id from services`));
ok("outra casa NÃO vê serviço privado da casa H", !ids(r).includes(S_PRIV) && ids(r).includes(S_OTHER));
r = await as("authenticated", U.C, (c) => q(c, `update services set listed=true where id=$1`, [S_PRIV]));
ok("cliente não consegue tornar público o serviço de uma casa", (r.n ?? 0) === 0 || Boolean(r.err), r.err ?? `${r.n} linha(s)`);

// ---- prova de oferta no chat
const CONV = (await as("authenticated", U.C, (c) => q(c, `select open_conversation($1) id`, [U.H]))).rows[0].id;
const CONV2 = (await as("authenticated", U.C2, (c) => q(c, `select open_conversation($1) id`, [U.H]))).rows[0].id;
const forChat = async (uid, id) => (await as("authenticated", uid, (c) => q(c, `select id from service_for_chat($1)`, [id]))).rows ?? [];
ok("sem oferta: cliente não obtém o serviço privado pelo chat", (await forChat(U.C, S_PRIV)).length === 0);
ok("serviço da página: qualquer logado obtém pelo chat", (await forChat(U.X, S_PUB)).length === 1);
r = await as("authenticated", U.C, (c) => q(c, `insert into messages(conversation_id,sender_id,text,from_assistant,action) values ($1,$2,'oi',true,$3::jsonb)`, [CONV, U.H, JSON.stringify({ target: "service", id: S_PRIV })]));
ok("ataque: cliente não grava mensagem como assistente (from_assistant=true)", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, `insert into messages(conversation_id,sender_id,text,action) values ($1,$2,'quero',$3::jsonb)`, [CONV, U.C, JSON.stringify({ target: "service", id: S_PRIV })]));
ok("ataque: mensagem do cliente com 'action' forjado não vira prova", (await forChat(U.C, S_PRIV)).length === 0, r.err ?? "inseriu");
await su.query(`insert into messages(conversation_id,sender_id,text,from_assistant,action) values ($1,$2,'Ótimo! [botão]',true,$3::jsonb)`, [CONV, U.H, JSON.stringify({ target: "service", id: S_PRIV })]);
ok("com a oferta da assistente: o cliente da conversa obtém o serviço privado", (await forChat(U.C, S_PRIV)).length === 1);
ok("a oferta vale só para aquele serviço (não libera outro privado)", (await forChat(U.C, S_PRIV_NB)).length === 0);
ok("a oferta vale só para quem está na conversa (outro cliente não)", (await forChat(U.C2, S_PRIV)).length === 0 && (await forChat(U.X, S_PRIV)).length === 0);
ok("a casa dona obtém o próprio serviço privado pelo chat", (await forChat(U.H, S_PRIV)).length === 1);
await su.query(`update services set active=false where id=$1`, [S_PRIV_NB]);
await su.query(`insert into messages(conversation_id,sender_id,text,from_assistant,action) values ($1,$2,'oferta',true,$3::jsonb)`, [CONV, U.H, JSON.stringify({ target: "service", id: S_PRIV_NB })]);
ok("serviço pausado não é contratável nem com oferta", (await forChat(U.C, S_PRIV_NB)).length === 0);
await su.query(`update services set active=true where id=$1`, [S_PRIV_NB]);

// ---- horários: privado só com oferta; servidor sempre
const dayStr = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 5)::text d`)).rows[0].d;
const at = (hhmm, day = dayStr) => `(timestamp '${day} ${hhmm}') at time zone 'America/Sao_Paulo'`;
const slotsOf = async (role, uid, svcId, day = dayStr) => ((await as(role, uid, (c) => q(c, `select to_char(slot at time zone 'America/Sao_Paulo','HH24:MI') h from available_slots($1, $2::date, 1)`, [svcId, day]))).rows ?? []).map((x) => x.h);
ok("horários do serviço privado: estranho NÃO vê", (await slotsOf("authenticated", U.X, S_PRIV)).length === 0);
ok("horários do serviço privado: cliente com oferta vê", (await slotsOf("authenticated", U.C, S_PRIV)).length > 0);
ok("horários do serviço privado: outro cliente sem oferta NÃO vê", (await slotsOf("authenticated", U.C2, S_PRIV)).length === 0);
ok("horários do serviço privado: o servidor (assistente) vê", (await slotsOf("service_role", null, S_PRIV)).length > 0);
ok("horários do serviço privado: a casa dona vê", (await slotsOf("authenticated", U.H, S_PRIV)).length > 0);
ok("horários de serviço da página continuam abertos a todos", (await slotsOf("authenticated", U.X, S_PUB)).length > 0);
ok("horários: serviço de outra casa privado não vaza", (await slotsOf("authenticated", U.C, S_OTHER)).length === 0);

// ---- contratar: privado exige oferta; agenda única entre serviços
const book = (uid, svcId, hhmm) => as("authenticated", uid, (c) => q(c, `select create_booking($1, ${at(hhmm)}, 'nota') id`, [svcId]));
r = await book(U.X, S_PRIV, "10:00"); ok("ataque: estranho não agenda serviço privado", Boolean(r.err), r.err);
r = await book(U.C2, S_PRIV, "10:00"); ok("ataque: cliente sem oferta não agenda o privado", Boolean(r.err), r.err);
r = await as("authenticated", U.C2, (c) => q(c, `select create_service_order($1,'x') id`, [S_PRIV_NB])); ok("ataque: sem oferta não contrata o privado direto (create_service_order)", Boolean(r.err), r.err);
r = await book(U.C, S_PRIV, "10:00"); ok("com oferta: cliente agenda o serviço privado (10:00)", !r.err, r.err);
const after10 = await slotsOf("authenticated", U.X, S_PUB);
ok("agenda única: o horário agendado no privado some do serviço público", !after10.includes("10:00") && after10.includes("09:00") && after10.includes("11:00"), after10.join(","));
r = await book(U.X, S_PUB, "10:00"); ok("agenda única: 2º cliente não agenda o mesmo horário no serviço público", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, `select create_service_order($1,'x') id`, [S_PRIV_NB])); ok("com oferta: contrata o privado sem agenda (create_service_order)", !r.err, r.err);

// ---- calendário com hora bloqueia 2 h
const cal = (title, day, time, yearly = false, house = HID) => su.query(`insert into house_calendar_items(house_id,title,kind,on_date,on_time,yearly) values ($1,$2,'gira',$3,$4,$5)`, [house, title, day, time, yearly]);
const day2 = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 6)::text d`)).rows[0].d;
await cal("Gira de teste", day2, "14:00");
let s2 = await slotsOf("authenticated", U.X, S_PUB, day2);
ok("calendário: gira às 14:00 bloqueia 14:00 e 15:00 (2 h)", !s2.includes("14:00") && !s2.includes("15:00"), s2.join(","));
ok("calendário: 13:00 (termina 14:00) e 16:00 continuam livres", s2.includes("13:00") && s2.includes("16:00"), s2.join(","));
const day3 = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 7)::text d`)).rows[0].d;
await cal("Sem hora", day3, null);
ok("calendário: data SEM hora não bloqueia (só publicação)", (await slotsOf("authenticated", U.X, S_PUB, day3)).includes("14:00"));
const day4 = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 8)::text d`)).rows[0].d;
await cal("Festa anual", (await su.query(`select ($1::date - interval '2 years')::date::text d`, [day4])).rows[0].d, "18:00", true);
let s4 = await slotsOf("authenticated", U.X, S_PUB, day4);
ok("calendário: data que se repete todo ano bloqueia o dia do ano atual", !s4.includes("18:00") && !s4.includes("19:00") && s4.includes("17:00"), s4.join(","));
const day5 = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 9)::text d`)).rows[0].d;
await cal("Data antiga não anual", (await su.query(`select ($1::date - interval '1 year')::date::text d`, [day5])).rows[0].d, "10:00", false);
ok("calendário: data antiga que NÃO se repete não bloqueia hoje", (await slotsOf("authenticated", U.X, S_PUB, day5)).includes("10:00"));
const day6 = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 10)::text d`)).rows[0].d;
await cal("Gira da outra casa", day6, "10:00", false, HID2);
ok("calendário: bloqueio de OUTRA casa não afeta esta", (await slotsOf("authenticated", U.X, S_PUB, day6)).includes("10:00"));
const day7 = (await su.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 11)::text d`)).rows[0].d;
await cal("Obrigação noturna", day7, "23:00");
const day7n = (await su.query(`select ($1::date + 1)::text d`, [day7])).rows[0].d;
await su.query(`delete from house_availability where house_id=$1`, [HID]);
await su.query(`insert into house_availability(house_id,weekday,start_time,end_time) values ($1,extract(dow from $2::date)::int,'00:00','24:00'),($1,extract(dow from $3::date)::int,'00:00','24:00')`, [HID, day7, day7n]).catch(async () => { await su.query(`insert into house_availability(house_id,weekday,start_time,end_time) values ($1,extract(dow from $2::date)::int,'00:00','23:59'),($1,extract(dow from $3::date)::int,'00:00','23:59')`, [HID, day7, day7n]); });
const s7 = await slotsOf("authenticated", U.X, S_PUB, day7), s7n = await slotsOf("authenticated", U.X, S_PUB, day7n);
ok("calendário: obrigação às 23:00 bloqueia 23:00 e atravessa a meia-noite (00:00 do dia seguinte)", !s7.includes("23:00") && !s7n.includes("00:00") && s7n.includes("02:00"), `${s7.slice(-2)} | ${s7n.slice(0, 3)}`);
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"off"}}'::jsonb where key='features'`);
await su.query(`delete from house_availability where house_id=$1`, [HID]); for (let d = 0; d < 7; d++) await su.query(`insert into house_availability(house_id,weekday,start_time,end_time) values ($1,$2,'08:00','20:00')`, [HID, d]);
const offS = await slotsOf("authenticated", U.X, S_PUB, day2); ok("calendário desligado: itens com hora deixam de bloquear", offS.includes("14:00"), offS.join(",") + " / " + JSON.stringify((await su.query(`select value from platform_settings where key='features'`)).rows));
await su.query(`update platform_settings set value='{"payments":{"state":"off"},"calendar":{"state":"on"}}'::jsonb where key='features'`);

// ---- ritual com duração continua bloqueando (e a gira não o impede de ser publicado — a casa decide)
console.log(bad ? `\n${bad} FALHA(S)` : "\nTODAS AS VERIFICAÇÕES PASSARAM");
await su.end(); process.exit(bad ? 1 : 0);
