// Verificação LOCAL da Fase 3 — jornadas 7 e 8 (ritual coletivo: vagas, fila de espera, reserva temporária) num PostgreSQL 16: aplica 0001–0077 e ataca (vaga nunca vendida a mais, fila de espera, expiração da retenção, permissões).
// Uso: node supabase/verify/verify_fase3_rituais.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf3rit";
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



// ---------- semeadura: 12 clientes com aceite, casa com recebimento ligado
const KS = [];
for (let i = 1; i <= 12; i++) {
  const id = `c${String(i).padStart(7, "0")}-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`;
  KS.push(id);
  await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, `k${i}@x`]);
  await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do nothing`, [id, `Cliente ${i}`]);
  for (const d of ["termos_cliente", "dados_sensiveis"]) await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,$2,'x')`, [id, d]);
}
await su.query(`update platform_settings set value='{"payments":{"state":"on"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
await su.query(`insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_H','ativa',true,true) on conflict do nothing`, [HID, U.H]).catch(() => null);
const DESC = "Descrição longa o suficiente para passar na validação mínima de descrição do ritual coletivo.";
const pay = (on) => su.query(`update platform_settings set value=$1::jsonb where key='features'`, [JSON.stringify({ payments: { state: on ? "on" : "off" }, calendar: { state: "on" } })]);
const ritual = async ({ seats, price = 5000, inHours = 72, status = "publicado" }) =>
  (await su.query(`insert into events(house_id,title,description,price_cents,seats_total,starts_at,status,duration_min) values ($1,'Ritual',$2,$3,$4, now() + make_interval(mins => $5), $6, 60) returning id`, [HID, DESC, price, seats, Math.round(inHours * 60), status])).rows[0].id;
const reserve = (u, ev) => as("authenticated", u, (c) => q(c, `select reserve_event($1,'{}'::jsonb) id`, [ev]));
const taken = async (ev) => Number((await su.query(`select public.event_taken($1) n`, [ev])).rows[0].n);
const holds = async (ev) => Number((await su.query(`select count(*)::int n from reservations where event_id=$1 and (status='confirmada' or (status='aguardando_pagamento' and expires_at>now()))`, [ev])).rows[0].n);
const notesOf = async (u, like) => (await su.query(`select text from notifications where user_id=$1 and text like $2`, [u, like])).rows.length;

// ---------- J7: vagas nunca vendidas a mais (sem cobrança pelo app e com cobrança)
await pay(false);
let EV = await ritual({ seats: 3 });
let rs = await Promise.all(KS.slice(0, 10).map((u) => reserve(u, EV)));
ok("sem cobrança pelo app: 10 reservas simultâneas para 3 vagas => exatamente 3 confirmadas", rs.filter((x) => !x.err).length === 3 && (await holds(EV)) === 3, `sucessos=${rs.filter((x) => !x.err).length}, vagas ocupadas=${await holds(EV)}`);
ok("sem cobrança pelo app: os 7 recusados recebem 'Vagas esgotadas'", rs.filter((x) => x.err).every((x) => /esgotad/i.test(x.err)));
await pay(true);
EV = await ritual({ seats: 2, price: 5000 });
rs = await Promise.all(KS.slice(0, 8).map((u) => reserve(u, EV)));
ok("pago: 8 reservas simultâneas para 2 vagas => exatamente 2 retenções", rs.filter((x) => !x.err).length === 2 && (await holds(EV)) === 2, `sucessos=${rs.filter((x) => !x.err).length}`);
ok("pago: cada retenção tem 1 pagamento pendente (nem mais, nem menos)", Number((await su.query(`select count(*)::int n from payments p join reservations r on r.id=p.reservation_id where r.event_id=$1 and p.status='pendente'`, [EV])).rows[0].n) === 2);
await pay(false);
EV = await ritual({ seats: 5 });
rs = await Promise.all([reserve(KS[0], EV), reserve(KS[0], EV), reserve(KS[0], EV)]);
ok("o mesmo cliente tocando 3 vezes ao mesmo tempo ocupa só 1 vaga", rs.filter((x) => !x.err).length === 1 && (await holds(EV)) === 1, `sucessos=${rs.filter((x) => !x.err).length}`);
ok("…e a mensagem do 2º toque é clara", rs.filter((x) => x.err).every((x) => /já tem vaga/i.test(x.err)));

// ---------- J7: regras de quem pode reservar
EV = await ritual({ seats: 5 });
r = await as("anon", null, (c) => q(c, `select reserve_event($1,'{}'::jsonb)`, [EV]));
ok("ataque: visitante não reserva", Boolean(r.err));
r = await reserve(U.H, EV);
ok("a casa não reserva vaga no próprio ritual", Boolean(r.err) && /própria|próprio/i.test(r.err), r.err ?? "");
const EV_DRAFT = await ritual({ seats: 5, status: "rascunho" });
r = await reserve(KS[1], EV_DRAFT);
ok("ritual em rascunho não aceita reserva", Boolean(r.err), r.err ?? "reservou");
const EV_NEAR = await ritual({ seats: 5, inHours: 0.5 });
r = await reserve(KS[1], EV_NEAR);
ok("reservas encerram 1 hora antes do início", Boolean(r.err) && /1 hora/.test(r.err), r.err ?? "reservou");
r = await reserve(KS[1], "00000000-0000-0000-0000-00000000dead");
ok("ritual inexistente é recusado", Boolean(r.err));
await pay(true);
const EV_FAR = await ritual({ seats: 5, price: 5000, inHours: 24 * 40 });
r = await reserve(KS[1], EV_FAR);
await pay(false);
ok("reserva paga só abre 30 dias antes", Boolean(r.err) && /30 dias/.test(r.err), r.err ?? "reservou");

// ---------- J7: fila de espera
const FULL = await ritual({ seats: 1 });
await reserve(KS[0], FULL);
let w1 = await as("authenticated", KS[1], (c) => q(c, `select join_event_waitlist($1) pos`, [FULL]));
ok("com a vaga esgotada, o cliente entra na fila (posição 1)", !w1.err && w1.rows[0].pos === 1, w1.err ?? "");
let w1b = await as("authenticated", KS[1], (c) => q(c, `select join_event_waitlist($1) pos`, [FULL]));
ok("entrar duas vezes na fila é inofensivo (mesma posição, 1 só registro)", !w1b.err && w1b.rows[0].pos === 1 && Number((await su.query(`select count(*)::int n from event_waitlist where event_id=$1 and user_id=$2`, [FULL, KS[1]])).rows[0].n) === 1);
ok("a casa é avisada uma única vez da entrada na fila", (await notesOf(U.H, "%entrou na fila de espera%")) === 1, String(await notesOf(U.H, "%entrou na fila de espera%")));
let w2 = await as("authenticated", KS[2], (c) => q(c, `select join_event_waitlist($1) pos`, [FULL]));
ok("o segundo cliente fica na posição 2", !w2.err && w2.rows[0].pos === 2, w2.err ?? "");
r = await as("authenticated", KS[0], (c) => q(c, `select join_event_waitlist($1) pos`, [FULL]));
ok("quem já tem vaga não entra na fila", Boolean(r.err) && /já tem vaga/i.test(r.err), r.err ?? "");
r = await as("authenticated", U.H, (c) => q(c, `select join_event_waitlist($1) pos`, [FULL]));
ok("a casa não entra na própria fila", Boolean(r.err));
const OPEN = await ritual({ seats: 5 });
r = await as("authenticated", KS[3], (c) => q(c, `select join_event_waitlist($1) pos`, [OPEN]));
ok("com vaga disponível não há fila (manda reservar)", Boolean(r.err) && /vagas/i.test(r.err), r.err ?? "");
r = await as("anon", null, (c) => q(c, `select join_event_waitlist($1)`, [FULL]));
ok("ataque: visitante não entra na fila", Boolean(r.err));
r = await as("authenticated", KS[2], (c) => q(c, `select * from event_waitlist where event_id=$1`, [FULL]));
ok("cada cliente enxerga só a própria posição na fila", !r.err && r.rows.length === 1 && r.rows[0].user_id === KS[2], r.err ?? String(r.rows?.length));

// vaga aberta: cancelar avisa só o 1º da fila (1 vaga livre => 1 aviso)
const myRes = (await su.query(`select id from reservations where event_id=$1 and user_id=$2`, [FULL, KS[0]])).rows[0].id;
r = await as("authenticated", KS[5], (c) => q(c, `select cancel_reservation($1)`, [myRes]));
ok("ataque: outro cliente não cancela a reserva alheia", Boolean(r.err));
ok("…e a reserva continua de pé", (await holds(FULL)) === 1);
r = await as("authenticated", KS[0], (c) => q(c, `select cancel_reservation($1)`, [myRes]));
ok("o dono da reserva cancela", !r.err, r.err ?? "");
ok("a vaga volta a ficar livre", (await holds(FULL)) === 0);
ok("só o 1º da fila é avisado da vaga (1 vaga => 1 aviso)", (await notesOf(KS[1], "%Abriu uma vaga%")) === 1 && (await notesOf(KS[2], "%Abriu uma vaga%")) === 0);
r = await as("authenticated", KS[0], (c) => q(c, `select cancel_reservation($1)`, [myRes]));
ok("cancelar duas vezes não repete (segunda recusada)", Boolean(r.err));
r = await reserve(KS[1], FULL);
ok("o avisado reserva a vaga", !r.err, r.err ?? "");
r = await as("authenticated", KS[2], (c) => q(c, `select join_event_waitlist($1) pos`, [FULL]));
ok("quem continua na fila segue podendo entrar de novo sem duplicar (a posição não conta quem já reservou)", !r.err && r.rows[0].pos === 1, r.err ?? `posição ${r.rows?.[0]?.pos}`);

// ---------- J8: retenção de 15 min expira e libera a vaga
await pay(true);
const PAID = await ritual({ seats: 1, price: 5000 });
const hold = await reserve(KS[6], PAID);
ok("reserva paga nasce temporária (15 min)", !hold.err && Number((await su.query(`select round(extract(epoch from (expires_at-now()))/60)::int m from reservations where id=$1`, [hold.rows?.[0]?.id])).rows[0].m) === 15, hold.err ?? "");
ok("a vaga retida bloqueia outro cliente", Boolean((await reserve(KS[7], PAID)).err));
let w3 = await as("authenticated", KS[7], (c) => q(c, `select join_event_waitlist($1) pos`, [PAID]));
ok("quem tentou entra na fila", !w3.err, w3.err ?? "");
await su.query(`update reservations set expires_at = now() - interval '1 second' where id=$1`, [hold.rows[0].id]);
ok("retenção vencida já não conta como vaga ocupada (liberada sem depender de ninguém)", (await holds(PAID)) === 0 && (await taken(PAID)) === 0, `ocupadas=${await taken(PAID)}`);
// antes da rotina a fila ainda não foi avisada; quem avisa é a rotina (testado abaixo)
const slept = await notesOf(KS[7], "%Abriu uma vaga%");
ok("antes da rotina rodar, nenhum aviso foi enviado (estado de partida)", slept === 0, `avisos=${slept}`);
r = await su.query(`select public.expire_stale_holds() n`).then((x) => x.rows[0].n, (e) => "ERRO: " + e.message.slice(0, 80));
ok("rotina de expiração existe e devolve quantas retenções encerrou", typeof r === "number" && r >= 1, String(r));
ok("depois da rotina: reserva 'expirada' e pagamento pendente 'falhou'", (await su.query(`select r.status::text s, (select status::text from payments where reservation_id=r.id) p from reservations r where r.id=$1`, [hold.rows[0].id])).rows[0].s === "expirada" && (await su.query(`select status::text p from payments where reservation_id=$1`, [hold.rows[0].id])).rows[0].p === "falhou");
ok("depois da rotina: a fila foi avisada (1 vez) e o próximo reserva", (await notesOf(KS[7], "%Abriu uma vaga%")) === 1 && !(await reserve(KS[7], PAID)).err);
const again = await su.query(`select public.expire_stale_holds() n`).then((x) => x.rows[0].n, () => -1);
ok("rodar a rotina de novo não repete avisos nem altera nada (0 novas)", again === 0 && (await notesOf(KS[7], "%Abriu uma vaga%")) === 1, String(again));
r = await as("authenticated", KS[1], (c) => q(c, `select public.expire_stale_holds()`));
ok("ataque: cliente não executa a rotina de expiração", Boolean(r.err), r.err ?? "executou");
r = await as("anon", null, (c) => q(c, `select public.expire_stale_holds()`));
ok("ataque: visitante não executa a rotina de expiração", Boolean(r.err));
const sched = /cron\.schedule\('expire-stale-holds', '\* \* \* \* \*', 'select public\.expire_stale_holds\(\)'\)/;
ok("a rotina está agendada a cada minuto (migration 0077 e passo 43)", sched.test(readFileSync(MIG + "0077_expirar_retencoes.sql", "utf8")) && sched.test(readFileSync(ROLL + "passo-43.sql", "utf8")));
ok("passo 43 reproduz a função da migration", readFileSync(ROLL + "passo-43.sql", "utf8").includes("create or replace function public.expire_stale_holds()") && readFileSync(ROLL + "passo-43.sql", "utf8").includes("revoke all on function public.expire_stale_holds()"));

console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
await su.end();
process.exit(bad ? 1 : 0);
