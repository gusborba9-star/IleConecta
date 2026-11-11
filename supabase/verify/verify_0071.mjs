// Verificação LOCAL da 0071 (F4: estado do atendimento) num PostgreSQL 16: aplica 0001–0070, mede o relatório antes,
// aplica a 0071 duas vezes e ataca (permissões, concorrência, expiração, isolamento, aviso no celular).
// Uso: node supabase/verify/verify_0071.mjs   (PG em 127.0.0.1:5544; env PASSOS=1 aplica supabase/rollout/passo-26.. em vez da migration)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "v0071";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 70).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
ok("migrations 0001–0070 aplicadas sem erro", failed.length === 0, failed.join(" | "));
const as = async (role, uid, fn) => { const c = await connect(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const U = { H: "a0000000-0000-0000-0000-00000000000a", C: "c0000000-0000-0000-0000-00000000000c", C2: "c2000000-0000-0000-0000-0000000000c2", S: "50000000-0000-0000-0000-000000000005", S2: "52000000-0000-0000-0000-000000000052", X: "e0000000-0000-0000-0000-00000000000e", H2: "b0000000-0000-0000-0000-00000000000b" };
const HID = "aa000000-0000-0000-0000-0000000000aa", HID2 = "bb000000-0000-0000-0000-0000000000bb";
for (const [k, id] of Object.entries(U)) {
  await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, k + "@x"]);
  await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name`, [id, ["H", "H2"].includes(k) ? "casa" : "cliente", "Pessoa " + k + " Teste"]);
}
await su.query("set session_replication_role = replica");
await su.query(`insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa H','casa-h','maximo'),($3,$4,'Casa H2','casa-h2','maximo')`, [HID, U.H, HID2, U.H2]);
await su.query("set session_replication_role = origin");
await su.query(`insert into house_extra_seats(house_id,seats) values ($1,2)`, [HID]).catch(() => null);
await su.query(`insert into house_staff(house_id,user_id,name,perms) values ($1,$2,'Equipe Um',array['chat_reply','chat_read']), ($1,$3,'Equipe Dois',array['chat_read'])`, [HID, U.S, U.S2]);
// Conversas
const conv = async (who, other) => (await as("authenticated", who, (c) => q(c, `select open_conversation($1) id`, [other]))).rows[0].id;
const CV = await conv(U.C, U.H), CV2 = await conv(U.C2, U.H), CVX = await conv(U.C, U.H2);
// Relatório ANTES da 0071 (para provar que só a linha 'handoffs' mudou)
await su.query(`insert into notifications(user_id,text,href) values ($1,'Fulano precisa de você: teste. A assistente passou a conversa para a casa.','/mensagens/x')`, [U.H]);
const rep0 = (await as("authenticated", U.H, (c) => q(c, `select house_assistant_report(7) r`))).rows[0].r;
ok("pré-condição: relatório antigo conta a notificação pelo texto", rep0.handoffs === 1, JSON.stringify(rep0.handoffs));

// Aplica a 0071 duas vezes
const sql71 = process.env.PASSOS ? readdirSync(ROLL).filter((f) => /^passo-(2[6-9]|30)\.sql$/.test(f)).sort().map((f) => readFileSync(ROLL + f, "utf8")).join("\n") : load("0071_estado_do_atendimento.sql");
let e71 = null; try { await su.query(sql71); await su.query(sql71); } catch (e) { e71 = e.message; }
ok(`0071 ${process.env.PASSOS ? "(pelos passos) " : ""}aplica duas vezes sem erro (idempotente)`, e71 === null, e71 ?? "");

// ACL
const priv = async (role, sig) => (await su.query(`select has_function_privilege($1, $2, 'execute') x`, [role, sig])).rows[0].x;
for (const sig of ["handoff_allows_assistant(uuid,uuid)", "handoff_mark_pending(uuid,uuid,text)"]) {
  ok(`ACL: ${sig} só o service_role executa`, (await priv("service_role", "public." + sig)) && !(await priv("anon", "public." + sig)) && !(await priv("authenticated", "public." + sig)));
}
for (const sig of ["trg_messages_handoff()", "handoff_actor(uuid)"]) ok(`ACL: ${sig} ninguém de fora executa`, !(await priv("anon", "public." + sig)) && !(await priv("authenticated", "public." + sig)));
for (const sig of ["conversation_handoff_state(uuid)", "handoff_take(uuid)", "handoff_release(uuid)"]) ok(`ACL: ${sig} só authenticated (não anon)`, (await priv("authenticated", "public." + sig)) && !(await priv("anon", "public." + sig)));
for (const t of ["conversation_handoff", "handoff_events"]) for (const role of ["anon", "authenticated"]) {
  const r = await as(role, role === "authenticated" ? U.H : null, (c) => q(c, `select * from public.${t}`));
  ok(`ACL: ${role} não lê ${t} direto`, Boolean(r.err) && /permission denied/.test(r.err), r.err);
  const w = await as(role, role === "authenticated" ? U.H : null, (c) => q(c, `delete from public.${t}`));
  ok(`ACL: ${role} não apaga de ${t}`, Boolean(w.err), w.err);
}

const state = (uid, cv) => as("authenticated", uid, (c) => q(c, `select * from conversation_handoff_state($1)`, [cv]));
const allows = async (cv, owner = U.H) => (await as("service_role", null, (c) => q(c, `select handoff_allows_assistant($1,$2) x`, [cv, owner]))).rows[0].x;
const pending = async (cv, owner = U.H, reason = "assunto delicado") => as("service_role", null, (c) => q(c, `select handoff_mark_pending($1,$2,$3) x`, [cv, owner, reason]));
const events = async (cv) => (await su.query(`select action from handoff_events where conversation_id=$1 order by id`, [cv])).rows.map((r) => r.action);
const sendC = (uid, cv, text = "oi") => as("authenticated", uid, (c) => q(c, `insert into messages(conversation_id,sender_id,text) values ($1,$2,$3)`, [cv, uid, text]));

// Estado inicial e mensagem de cliente
ok("inicial: a assistente pode responder", (await allows(CV)) === true);
let st = (await state(U.C, CV)).rows[0]; ok("inicial: estado 'automacao' e inativo para o cliente", st.state === "automacao" && st.active === false);
await sendC(U.C, CV, "olá");
ok("mensagem de cliente não cria estado", Number((await su.query(`select count(*) n from conversation_handoff where conversation_id=$1`, [CV])).rows[0].n) === 0);

// Passagem pela assistente
let p = await pending(CV); ok("passagem: 1ª devolve true (avisar a casa)", p.rows?.[0]?.x === true, p.err);
p = await pending(CV); ok("passagem: 2ª dentro de 30 min devolve false (sem aviso repetido)", p.rows?.[0]?.x === false, p.err);
ok("passagem: a assistente NÃO pode responder", (await allows(CV)) === false);
st = (await state(U.C, CV)).rows[0]; ok("passagem: cliente vê estado 'pendente' ativo", st.state === "pendente" && st.active === true);
st = (await state(U.H, CV)).rows[0]; ok("passagem: dono vê 'pendente'", st.state === "pendente");
st = (await state(U.S, CV)).rows[0]; ok("passagem: equipe com leitura vê 'pendente'", st?.state === "pendente");
let r = await state(U.X, CV); ok("isolamento: estranho não lê o estado", Boolean(r.err) && r.code === "42501", r.err);
r = await state(U.C2, CV); ok("isolamento: outro cliente não lê o estado", Boolean(r.err), r.err);
r = await state(U.H2, CV); ok("isolamento: dono de outra casa não lê o estado", Boolean(r.err), r.err);
r = await as("anon", null, (c) => q(c, `select * from conversation_handoff_state($1)`, [CV])); ok("isolamento: anon não executa", Boolean(r.err), r.err);
ok("passagem: outra casa (dono errado) não é bloqueada por este estado", (await allows(CV, U.H2)) === true);
r = await pending(CV, U.H2); ok("passagem: marcar com dono que não é membro é recusado", Boolean(r.err), r.err);
r = await as("authenticated", U.H, (c) => q(c, `select handoff_mark_pending($1,$2,'x')`, [CV, U.H])); ok("ataque: authenticated não chama handoff_mark_pending", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, `select handoff_allows_assistant($1,$2)`, [CV, U.H])); ok("ataque: authenticated não chama handoff_allows_assistant", Boolean(r.err), r.err);
ok("eventos: 2 passagens registradas", JSON.stringify(await events(CV)) === JSON.stringify(["passada_para_casa", "passada_para_casa"]), JSON.stringify(await events(CV)));
await sendC(U.C, CV, "alguém aí?");
st = (await state(U.C, CV)).rows[0]; ok("mensagem de cliente não tira o estado de 'pendente'", st.state === "pendente");

// Casa responde
await as("authenticated", U.H, (c) => q(c, `insert into messages(conversation_id,sender_id,text) values ($1,$2,'Estou aqui')`, [CV, U.H]));
st = (await state(U.C, CV)).rows[0]; ok("casa respondeu: estado 'humano' ativo", st.state === "humano" && st.active === true);
ok("casa respondeu: assistente bloqueada", (await allows(CV)) === false);
ok("casa respondeu: 'assumida' registrada uma vez", (await events(CV)).filter((x) => x === "assumida").length === 1);
await as("authenticated", U.H, (c) => q(c, `insert into messages(conversation_id,sender_id,text) values ($1,$2,'Segunda')`, [CV, U.H]));
ok("casa respondeu de novo: não duplica 'assumida'", (await events(CV)).filter((x) => x === "assumida").length === 1);
// Mensagem da assistente não muda o estado
await su.query(`insert into messages(conversation_id,sender_id,text,from_assistant) values ($1,$2,'resposta da assistente',true)`, [CV, U.H]);
st = (await state(U.C, CV)).rows[0]; ok("mensagem marcada como da assistente não altera o estado", st.state === "humano" && st.handler_name === null);

// Equipe
r = await as("authenticated", U.S, (c) => q(c, `select staff_send($1,'Atendo pela equipe')`, [CV2])); ok("equipe com permissão envia", !r.err, r.err);
st = (await state(U.C2, CV2)).rows[0]; ok("equipe respondeu: 'humano' com o nome da equipe", st.state === "humano" && st.handler_name === "Equipe Um", JSON.stringify(st));
r = await as("authenticated", U.S2, (c) => q(c, `select handoff_release($1)`, [CV2])); ok("equipe sem permissão de responder NÃO devolve", Boolean(r.err), r.err);
r = await as("authenticated", U.S2, (c) => q(c, `select handoff_take($1)`, [CV2])); ok("equipe sem permissão de responder NÃO assume", Boolean(r.err), r.err);
r = await as("authenticated", U.S, (c) => q(c, `select handoff_release($1)`, [CV2])); ok("equipe com permissão devolve à assistente", !r.err, r.err);
ok("devolvida: assistente volta a responder", (await allows(CV2)) === true && (await events(CV2)).includes("devolvida"));
r = await as("authenticated", U.S, (c) => q(c, `select handoff_release($1)`, [CV])); // CV é da mesma casa
ok("equipe devolve conversa da própria casa", !r.err && (await allows(CV)) === true, r.err);
r = await as("authenticated", U.S, (c) => q(c, `select handoff_release($1)`, [CVX])); ok("equipe NÃO age em conversa de outra casa", Boolean(r.err), r.err);
r = await as("authenticated", U.S, (c) => q(c, `select handoff_take($1)`, [CVX])); ok("equipe NÃO assume conversa de outra casa", Boolean(r.err), r.err);
for (const fn of ["handoff_release", "handoff_take"]) {
  for (const [who, uid] of [["cliente", U.C], ["estranho", U.X], ["dono de outra casa", U.H2]]) { r = await as("authenticated", uid, (c) => q(c, `select ${fn}($1)`, [CV])); ok(`ataque: ${who} não executa ${fn}`, Boolean(r.err), r.err); }
  r = await as("anon", null, (c) => q(c, `select ${fn}($1)`, [CV])); ok(`ataque: anon não executa ${fn}`, Boolean(r.err), r.err);
}
// Assumir sem escrever
r = await as("authenticated", U.H, (c) => q(c, `select handoff_take($1)`, [CV])); ok("dono assume sem escrever", !r.err && (await allows(CV)) === false, r.err);
r = await as("authenticated", U.H, (c) => q(c, `select handoff_release($1)`, [CV])); ok("dono devolve", !r.err && (await allows(CV)) === true, r.err);
r = await as("authenticated", U.H, (c) => q(c, `select handoff_release($1)`, [CV])); ok("devolver duas vezes não dá erro nem duplica evento", !r.err && (await events(CV)).filter((x) => x === "devolvida").length === 2, r.err + JSON.stringify(await events(CV)));

// Expiração (12 h)
await as("authenticated", U.H, (c) => q(c, `insert into messages(conversation_id,sender_id,text) values ($1,$2,'volta')`, [CV, U.H]));
ok("antes de expirar: bloqueada", (await allows(CV)) === false);
await su.query(`update conversation_handoff set updated_at = now() - interval '13 hours' where conversation_id=$1`, [CV]);
ok("após 13 h sem atividade humana: a assistente volta", (await allows(CV)) === true);
st = (await state(U.C, CV)).rows[0]; ok("após 13 h: estado inativo para o cliente", st.active === false);
await su.query(`update conversation_handoff set updated_at = now() - interval '11 hours' where conversation_id=$1`, [CV]);
ok("após 11 h: ainda bloqueada", (await allows(CV)) === false);

// Dedupe 30 min após o último aviso
await su.query(`update handoff_events set created_at = now() - interval '31 minutes' where conversation_id=$1`, [CV]);
p = await pending(CV); ok("passagem 31 min depois do último aviso: avisa de novo", p.rows?.[0]?.x === true, p.err);
st = (await state(U.H, CV)).rows[0]; ok("de 'humano' para 'pendente' pela assistente", st.state === "pendente");

// Concorrência: 8 passagens simultâneas numa conversa nova → exatamente 1 aviso
const CVN = await conv(U.X, U.H);
const results = await Promise.all(Array.from({ length: 8 }, () => pending(CVN)));
ok("concorrência: 8 passagens simultâneas geram exatamente 1 aviso", results.filter((x) => x.rows?.[0]?.x === true).length === 1 && results.every((x) => !x.err), JSON.stringify(results.map((x) => x.rows?.[0]?.x ?? x.err)));
ok("concorrência: 8 eventos registrados", (await events(CVN)).length === 8);
const CVM = await conv(U.C2, U.H2);
const mix = await Promise.all([pending(CVM, U.H2), as("authenticated", U.H2, (c) => q(c, `insert into messages(conversation_id,sender_id,text) values ($1,$2,'oi')`, [CVM, U.H2])), pending(CVM, U.H2)]);
ok("concorrência: passagem e resposta humana simultâneas não quebram", mix.every((x) => !x.err), JSON.stringify(mix.map((x) => x.err ?? "ok")));


// Mensagem da assistente num estado 'pendente' não vira 'humano' (e não duplica eventos)
{
  const CVA = await conv(U.C2, U.H2); await pending(CVA, U.H2);
  await su.query(`insert into messages(conversation_id,sender_id,text,from_assistant) values ($1,$2,'resposta',true)`, [CVA, U.H2]);
  const s2 = (await state(U.C2, CVA)).rows[0]; ok("mensagem da assistente com estado 'pendente' mantém 'pendente'", s2.state === "pendente", s2.state);
  // Conversa entre duas casas: a outra casa não mexe no estado da casa dona do atendimento
  const CVH = await conv(U.H2, U.H); await pending(CVH, U.H);
  await as("authenticated", U.H2, (c) => q(c, `select handoff_release($1)`, [CVH]));
  const s3 = (await state(U.H, CVH)).rows[0]; ok("conversa casa×casa: a outra casa não devolve o atendimento da casa dona", s3.state === "pendente" && (await allows(CVH, U.H)) === false, s3.state);
}

// Constraints
r = await q(su, `insert into conversation_handoff(conversation_id,house_owner_id,state) values ($1,$2,'qualquer')`, [CVX, U.H2]); ok("constraint: estado inválido recusado", Boolean(r.err));
r = await q(su, `update conversation_handoff set reason=repeat('x',201) where conversation_id=$1`, [CV]); ok("constraint: motivo > 200 recusado", Boolean(r.err));
r = await q(su, `insert into notifications(user_id,text,href,kind) values ($1,'x','/x','outro')`, [U.H]); ok("constraint: kind inválido recusado", Boolean(r.err));
await su.query(`delete from conversations where id=$1`, [CVN]);
ok("apagar a conversa limpa estado e eventos (cascade)", Number((await su.query(`select (select count(*) from conversation_handoff where conversation_id=$1)+(select count(*) from handoff_events where conversation_id=$1) n`, [CVN])).rows[0].n) === 0);

// Aviso no celular (Não perturbe)
await su.query(`insert into push_subscriptions(user_id,endpoint,p256dh,auth) values ($1,'e1','p','a')`, [U.H]);
await su.query(`insert into notification_prefs(user_id,quiet_on,quiet_start,quiet_end) values ($1,true,0,23) on conflict (user_id) do update set quiet_on=true, quiet_start=0, quiet_end=23`, [U.H]);
await su.query(`delete from http_log`);
await su.query(`insert into notifications(user_id,text,href) values ($1,'Mensagem comum','/m')`, [U.H]);
{ const n = Number((await su.query(`select count(*) n from http_log`)).rows[0].n); ok("Não perturbe: aviso comum é silenciado", n === 0, "n=" + n); }
await su.query(`insert into notifications(user_id,text,href,kind) values ($1,'Ana precisa de você: algo.','/m','handoff')`, [U.H]);
ok("Não perturbe: aviso kind='handoff' fura o silêncio", Number((await su.query(`select count(*) n from http_log`)).rows[0].n) === 1);
await su.query(`insert into notifications(user_id,text,href) values ($1,'Ana precisa de você: antigo.','/m')`, [U.H]);
ok("Não perturbe: aviso antigo (sem kind, com o texto) continua furando", Number((await su.query(`select count(*) n from http_log`)).rows[0].n) === 2);
await su.query(`insert into notifications(user_id,text,href,kind) values ($1,'Mensagem comum 2 precisa de você','/m','handoff')`, [U.H]).catch(() => null);
await su.query(`delete from http_log`);
await su.query(`insert into notifications(user_id,text,href) values ($1,'Falsa: ele precisa de vocês','/m')`, [U.H]);
ok("Não perturbe: texto parecido ('precisa de vocês') não fura", Number((await su.query(`select count(*) n from http_log`)).rows[0].n) === 0);

// Relatório
const rep1 = (await as("authenticated", U.H, (c) => q(c, `select house_assistant_report(7) r`))).rows[0].r;
const ev = Number((await su.query(`select count(*) n from handoff_events where house_owner_id=$1 and action='passada_para_casa'`, [U.H])).rows[0].n);
const legacy = Number((await su.query(`select count(*) n from notifications where user_id=$1 and kind is null and text like '%precisa de você:%'`, [U.H])).rows[0].n);
ok("relatório: handoffs = eventos + avisos antigos", rep1.handoffs === ev + legacy && ev >= 3, `${rep1.handoffs} = ${ev}+${legacy}`);
const { handoffs: _a, ...r0 } = rep0, { handoffs: _b, ...r1 } = rep1;
ok("relatório: as demais chaves continuam iguais às da versão anterior", JSON.stringify(Object.keys(r0)) === JSON.stringify(Object.keys(r1)) && r0.plan === r1.plan && r0.days === r1.days, Object.keys(r1).join(","));
const other = await as("authenticated", U.H2, (c) => q(c, `select house_assistant_report(7) r`));
const ev2 = Number((await su.query(`select count(*) n from handoff_events where house_owner_id=$1 and action='passada_para_casa'`, [U.H2])).rows[0].n);
ok("relatório: outra casa conta só as próprias passagens", other.rows?.[0]?.r?.handoffs === ev2 && ev2 !== ev, JSON.stringify(other.rows?.[0]?.r?.handoffs ?? other.err));
r = await as("authenticated", U.C, (c) => q(c, `select house_assistant_report(7)`)); ok("relatório: cliente continua sem acesso", Boolean(r.err), r.err);

// ===== 0072: casa offline e parada => a assistente volta a atender =====
const sql72 = process.env.PASSOS ? readFileSync(ROLL + "passo-31.sql", "utf8") : load("0072_atendimento_casa_offline.sql");
let e72 = null; try { await su.query(sql72); await su.query(sql72); } catch (e) { e72 = e.message; }
ok("0072 aplica duas vezes sem erro (idempotente)", e72 === null, e72 ?? "");
for (const sig of ["handoff_effective_active(text,timestamptz,uuid)", "handoff_allows_assistant(uuid,uuid)"]) ok(`ACL 0072: ${sig} só o service_role`, (await priv("service_role", "public." + sig)) && !(await priv("anon", "public." + sig)) && !(await priv("authenticated", "public." + sig)));
const setH = (st, mins) => su.query(`insert into conversation_handoff(conversation_id,house_owner_id,state,since,updated_at) values ($1,$2,$3,now(),now()-($4||' minutes')::interval) on conflict (conversation_id) do update set state=excluded.state, house_owner_id=excluded.house_owner_id, updated_at=excluded.updated_at`, [CV, U.H, st, String(mins)]);
const seen = (mins) => su.query(`update profiles set last_seen_at = ${mins === null ? "null" : `now()-interval '${mins} minutes'`} where id=$1`, [U.H]);
await seen(null);
await setH("humano", 2); ok("0072: humano há 2 min, casa offline => assistente calada", (await allows(CV)) === false);
await setH("humano", 11); ok("0072: humano há 11 min, casa offline => assistente atende", (await allows(CV)) === true);
await seen(1); ok("0072: humano há 11 min, casa online => assistente calada", (await allows(CV)) === false);
await seen(5); ok("0072: casa vista há 5 min (offline) => assistente atende", (await allows(CV)) === true);
await seen(null); await setH("humano", 13 * 60); ok("0072: humano há 13 h => assistente atende", (await allows(CV)) === true);
await seen(0); ok("0072: humano há 13 h mesmo com casa online => assistente atende (expira)", (await allows(CV)) === true);
await seen(null); await setH("pendente", 120); ok("0072: pendente há 2 h, casa offline => continua calada (a casa foi avisada)", (await allows(CV)) === false);
await setH("pendente", 13 * 60); ok("0072: pendente há 13 h => assistente atende", (await allows(CV)) === true);
await setH("automacao", 1); ok("0072: automação => assistente atende", (await allows(CV)) === true);
await setH("humano", 11); r = await state(U.C, CV); ok("0072: o cliente vê ativo=false com a casa offline e parada", r.rows?.[0]?.active === false, JSON.stringify(r.rows ?? r.err));
await seen(0); r = await state(U.C, CV); ok("0072: o cliente vê ativo=true com a casa online", r.rows?.[0]?.active === true, JSON.stringify(r.rows ?? r.err));
await seen(null); await setH("humano", 2); r = await state(U.C, CV); ok("0072: o cliente vê ativo=true se a casa respondeu há 2 min", r.rows?.[0]?.active === true);
r = await as("authenticated", U.X, (c) => q(c, `select * from conversation_handoff_state($1)`, [CV])); ok("0072: estranho continua sem ler o estado", Boolean(r.err), r.err);
r = await as("authenticated", U.C, (c) => q(c, `select handoff_effective_active('humano', now(), $1)`, [U.H])); ok("0072: authenticated não chama a função interna", Boolean(r.err), r.err);
await setH("humano", 2); await seen(null);
ok("0072: outra casa não é afetada (dono diferente)", (await allows(CV, U.H2)) === true);

console.log(bad ? `\n${bad} FALHA(S)` : "\nTODAS AS VERIFICAÇÕES PASSARAM");
await su.end(); process.exit(bad ? 1 : 0);
