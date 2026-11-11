// Verificação LOCAL da Fase 3 — jornada 12 (titular convida colaborador e concede só o autorizado) num PostgreSQL 16: aplica 0001–0077 e ataca (convite expirado/cancelado/reusado, permissão negada, remoção imediata, limite de acessos).
// Uso: node supabase/verify/verify_fase3_equipe.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "vf3eq";
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




const STAFF = ["c1000000-0000-0000-0000-0000000000a1", "c1000000-0000-0000-0000-0000000000a2", "c1000000-0000-0000-0000-0000000000a3"];
for (const [i, id] of STAFF.entries()) {
  await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, `s${i}@x`]);
  await su.query(`insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do nothing`, [id, `Colab ${i}`]);
}
await su.query(`insert into house_extra_seats(house_id,seats) values ($1,2)`, [HID]); // 1 (plano) + 2 = 3 acessos
const invite = (uid, house, name, perms) => as("authenticated", uid, (c) => q(c, `insert into house_staff_invites(house_id,name,perms) values ($1,$2,$3) returning token`, [house, name, perms]));
const accept = (uid, tok) => as(uid ? "authenticated" : "anon", uid, (c) => q(c, `select accept_staff_invite($1) h`, [tok]));
const call = (uid, sql, p) => as("authenticated", uid, (c) => q(c, sql, p));

// ---------- convites: criar
r = await invite(U.C, HID, "Intruso", ["chat_read"]);
ok("ataque: quem não é dono da casa não cria convite", Boolean(r.err), r.err ?? "criou");
r = await invite(U.H2, HID, "Outra casa", ["chat_read"]);
ok("ataque: dono de OUTRA casa não cria convite nesta", Boolean(r.err), r.err ?? "criou");
r = await invite(U.H, HID, "Fulano", ["chat_read", "admin_total"]);
ok("permissão inventada no convite é recusada", Boolean(r.err), r.err ?? "criou");
r = await invite(U.H, HID, "A", ["chat_read"]);
ok("nome curto demais é recusado", Boolean(r.err), r.err ?? "criou");
const t1 = (await invite(U.H, HID, "Ana", ["chat_read"])).rows?.[0]?.token;
ok("dono cria convite só com leitura de conversas", Boolean(t1));
ok("o convite tem validade de 7 dias", Number((await su.query(`select round(extract(epoch from (expires_at-created_at))/86400)::int d from house_staff_invites where token=$1`, [t1])).rows[0].d) === 7);

// ---------- convites: aceitar (tentando quebrar)
r = await accept(null, t1);
ok("ataque: visitante sem conta não aceita", Boolean(r.err), r.err ?? "aceitou");
r = await accept(U.C, "token-que-nao-existe");
ok("ataque: token inexistente recusado", Boolean(r.err) && /expirou|usado/.test(r.err), r.err ?? "");
r = await accept(U.H, t1);
ok("ataque: o próprio titular não aceita o convite da sua casa", Boolean(r.err), r.err ?? "aceitou");
r = await accept(U.H2, t1);
ok("ataque: dono de outra casa não vira colaborador (precisa ser conta de cliente)", Boolean(r.err), r.err ?? "aceitou");
r = await accept(STAFF[0], t1);
ok("colaborador aceita e recebe o nome da casa", !r.err && r.rows[0].h === "Casa H", r.err ?? "");
const mine = (await su.query(`select perms, name, active from house_staff where user_id=$1`, [STAFF[0]])).rows[0];
ok("o vínculo nasce só com as permissões do convite", mine && mine.perms.length === 1 && mine.perms[0] === "chat_read" && mine.active, JSON.stringify(mine));
r = await accept(STAFF[1], t1);
ok("ataque: convite já usado não é reaproveitado por outra pessoa", Boolean(r.err), r.err ?? "aceitou");
r = await accept(STAFF[0], t1);
ok("ataque: o mesmo convite não vale duas vezes nem para quem já usou", Boolean(r.err), r.err ?? "aceitou");
ok("continua um único vínculo", Number((await su.query(`select count(*)::int n from house_staff where house_id=$1`, [HID])).rows[0].n) === 1);

// convite expirado
const t2 = (await invite(U.H, HID, "Bia", ["orders"])).rows[0].token;
await su.query(`update house_staff_invites set expires_at = now() - interval '1 second' where token=$1`, [t2]);
r = await accept(STAFF[1], t2);
ok("ataque: convite expirado é recusado", Boolean(r.err) && /expirou/.test(r.err), r.err ?? "aceitou");
ok("convite expirado não deixa vínculo", Number((await su.query(`select count(*)::int n from house_staff where user_id=$1`, [STAFF[1]])).rows[0].n) === 0);
// convite cancelado pela casa
const t3 = (await invite(U.H, HID, "Caio", ["orders"])).rows[0].token;
r = await call(U.H, `delete from house_staff_invites where token=$1`, [t3]);
ok("a casa cancela um convite pendente", !r.err && r.n === 1, r.err ?? "");
r = await accept(STAFF[1], t3);
ok("ataque: convite cancelado não pode mais ser aceito", Boolean(r.err), r.err ?? "aceitou");
r = await call(STAFF[1], `delete from house_staff_invites where token=$1`, [t2]);
ok("ataque: terceiro não apaga nem enxerga convite alheio", r.n === 0 || Boolean(r.err), r.err ?? `${r.n}`);
r = await call(STAFF[1], `select token from house_staff_invites`);
ok("ataque: terceiro não lê os tokens dos convites", !r.err && r.rows.length === 0, r.err ?? `${r.rows?.length} tokens`);
r = await call(STAFF[0], `select token from house_staff_invites`);
ok("ataque: nem o colaborador lê os tokens dos convites", !r.err && r.rows.length === 0, r.err ?? `${r.rows?.length} tokens`);

// ---------- só o autorizado
const denied = async (n, uid, sql, p) => { const x = await call(uid, sql, p); ok(n, Boolean(x.err) || x.rows?.length === 0 || x.rows?.[0] && Object.values(x.rows[0])[0] === null, x.err ?? "permitido"); };
ok("a permissão de ler conversas funciona", (await call(STAFF[0], `select staff_perm('chat_read') h`)).rows[0].h === HID);
for (const k of ["chat_reply", "orders", "post", "calendar", "members", "stats"]) {
  ok(`sem a permissão '${k}' o acesso vem vazio`, (await call(STAFF[0], `select staff_perm($1) h`, [k])).rows[0].h === null);
}
r = await call(STAFF[0], `select staff_orders()`); ok("ataque: sem 'orders' não lista pedidos", Boolean(r.err), r.err ?? "listou");
r = await call(STAFF[0], `select staff_post('Publicação indevida')`); ok("ataque: sem 'post' não publica pela casa", Boolean(r.err), r.err ?? "publicou");
r = await call(STAFF[0], `select staff_calendar_add('Gira falsa','gira',current_date + 3,null,null,true)`); ok("ataque: sem 'calendar' não altera a agenda", Boolean(r.err), r.err ?? "alterou");
r = await call(STAFF[0], `select staff_send(gen_random_uuid(),'oi')`); ok("ataque: só leitura não responde conversa", Boolean(r.err) && /não inclui responder/.test(r.err), r.err ?? "respondeu");
r = await call(STAFF[0], `update house_staff set perms = array['chat_read','chat_reply','orders','post','calendar','members','stats'] where user_id=$1`, [STAFF[0]]);
ok("ataque: colaborador não aumenta as próprias permissões", r.n === 0 || Boolean(r.err), r.err ?? `${r.n}`);
ok("…e as permissões continuam as do convite", (await su.query(`select perms from house_staff where user_id=$1`, [STAFF[0]])).rows[0].perms.join() === "chat_read");
r = await call(STAFF[0], `update houses set name='Casa tomada' where id=$1`, [HID]); ok("ataque: colaborador não edita a casa", r.n === 0 || Boolean(r.err), r.err ?? `${r.n}`);
r = await call(STAFF[0], `select * from payments`); ok("ataque: colaborador não lê pagamentos", !r.err && r.rows.length === 0, r.err ?? `${r.rows?.length}`);
r = await call(STAFF[0], `select * from house_payment_accounts`); ok("ataque: colaborador não lê conta de recebimento", !r.err && r.rows.length === 0, r.err ?? `${r.rows?.length}`);
r = await call(STAFF[0], `select * from ledger_entries`); ok("ataque: colaborador não lê o livro-razão", !r.err && r.rows.length === 0, r.err ?? `${r.rows?.length}`);

// a casa amplia a permissão: vale na hora
r = await call(U.H, `update house_staff set perms = array['chat_read','post'] where user_id=$1`, [STAFF[0]]);
ok("a casa concede 'publicar'", !r.err && r.n === 1, r.err ?? "");
r = await call(STAFF[0], `select staff_post('Aviso da casa pelo colaborador') id`);
ok("agora o colaborador publica e fica registrado quem publicou", !r.err && (await su.query(`select staff_name from posts where id=$1`, [r.rows[0].id])).rows[0].staff_name === "Ana", r.err ?? "");
r = await call(STAFF[0], `select staff_orders()`); ok("…mas continua sem pedidos", Boolean(r.err));
// a casa retira: vale na hora
await call(U.H, `update house_staff set perms = array['chat_read'] where user_id=$1`, [STAFF[0]]);
r = await call(STAFF[0], `select staff_post('Depois de retirar')`); ok("retirada da permissão vale imediatamente", Boolean(r.err), r.err ?? "publicou");
// pausar
await call(U.H, `update house_staff set active=false where user_id=$1`, [STAFF[0]]);
ok("acesso pausado perde tudo na hora", (await call(STAFF[0], `select staff_perm('chat_read') h`)).rows[0].h === null);
await call(U.H, `update house_staff set active=true where user_id=$1`, [STAFF[0]]);
ok("reativado volta ao normal", (await call(STAFF[0], `select staff_perm('chat_read') h`)).rows[0].h === HID);
// 'members' exige plano máximo
await call(U.H, `update house_staff set perms = array['chat_read','members'] where user_id=$1`, [STAFF[0]]);
ok("'members' vale no plano Premium", (await call(STAFF[0], `select staff_perm('members') h`)).rows[0].h === HID);
await su.query(`update houses set plan='intermediario' where id=$1`, [HID]);
ok("plano cai: 'members' deixa de valer sem a casa mexer em nada", (await call(STAFF[0], `select staff_perm('members') h`)).rows[0].h === null);
await su.query(`update houses set plan='maximo' where id=$1`, [HID]);

// remover
r = await call(U.H, `delete from house_staff where user_id=$1`, [STAFF[0]]);
ok("a casa remove o colaborador", !r.err && r.n === 1, r.err ?? "");
ok("removido perde o acesso na hora", (await call(STAFF[0], `select staff_perm('chat_read') h`)).rows[0].h === null);
r = await call(STAFF[0], `select staff_post('Depois de removido')`); ok("removido não publica", Boolean(r.err));

// ---------- limite de acessos
const ts = [];
for (let i = 0; i < 3; i++) { const x = await invite(U.H, HID, "Pessoa " + i, ["stats"]); ts.push(x.rows?.[0]?.token); }
ok("a casa cria convites até o limite de acessos (3)", ts.every(Boolean), JSON.stringify(ts.map(Boolean)));
r = await invite(U.H, HID, "Excedente", ["stats"]);
ok("ataque: convite acima do limite do plano é recusado", Boolean(r.err), r.err ?? "criou");
// aceite simultâneo do MESMO convite por 3 pessoas: só um vence
const race = await Promise.all(STAFF.map((u) => accept(u, ts[0])));
ok("corrida: o mesmo convite aceito por 3 pessoas ao mesmo tempo vale uma vez só", race.filter((x) => !x.err).length === 1, `${race.filter((x) => !x.err).length} vencedores`);
ok("corrida: um vínculo só", Number((await su.query(`select count(*)::int n from house_staff where house_id=$1`, [HID])).rows[0].n) === 1);
// uma pessoa, dois convites: só um vínculo
const who = race.findIndex((x) => !x.err);
r = await accept(STAFF[who], ts[1]);
ok("ataque: quem já atende por uma casa não aceita segundo convite", Boolean(r.err), r.err ?? "aceitou");
// limite cai: acessos extras reduzidos, o vínculo mais novo pausa sozinho
await accept(STAFF[(who + 1) % 3], ts[1]);
await su.query(`update house_extra_seats set seats=0 where house_id=$1`, [HID]);
const actives = [];
for (const u of STAFF) actives.push((await call(u, `select staff_perm('stats') h`)).rows[0].h === HID);
ok("limite reduzido: só o vínculo mais antigo segue valendo", actives.filter(Boolean).length === 1 && actives[who], JSON.stringify(actives));

// ---------- auditoria
const au = (await su.query(`select action, count(*)::int n from staff_audit where house_id=$1 group by 1`, [HID])).rows;
ok("a auditoria registra convite criado, aceito e cancelado", ["convite_criado", "aceito", "convite_cancelado", "removido", "permissoes_alteradas"].every((a) => au.some((x) => x.action === a)), JSON.stringify(au));

await su.end();
console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
process.exit(bad ? 1 : 0);
