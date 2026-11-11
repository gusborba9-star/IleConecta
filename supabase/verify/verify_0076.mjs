// Verificação LOCAL da 0076 (aceite único: dados sensíveis valem até retirar; retirada registrada) num PostgreSQL 16: aplica 0001–0075, aplica a 0076 duas vezes e ataca
// (validade do aceite, retirada, forja, permissões, compra bloqueada sem aceite).
// Uso: node supabase/verify/verify_0076.mjs   (PG em 127.0.0.1:5544;)
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname, ROLL = new URL("../rollout/", import.meta.url).pathname;
const DB = "v0076";
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
for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) <= 75).sort()) { try { await su.query(load(f)); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); } }
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
ok("migrations 0001–0075 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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


const sql76 = process.env.PASSOS ? readdirSync(ROLL).filter((f) => /^passo-4[012]\.sql$/.test(f)).sort().map((f) => readFileSync(ROLL + f, "utf8")).join("\n") : load("0076_aceite_unico.sql");
let e76 = null; try { await su.query(sql76); await su.query(sql76); } catch (e) { e76 = e.message; }
ok(`0076 ${process.env.PASSOS ? "(pelos passos) " : ""}aplica duas vezes sem erro (idempotente)`, e76 === null, e76 ?? "");

// zera os aceites de dados sensíveis semeados e testa a regra nova
await su.query(`delete from legal_consents where doc_key='dados_sensiveis'`);
const rc = async (u, doc = "dados_sensiveis", min = 120) => (await su.query(`select public.has_recent_consent($1,$2,$3) v`, [u, doc, min])).rows[0].v;
const addAt = (u, doc, hoursAgo) => su.query(`insert into legal_consents(user_id,doc_key,doc_version,accepted_at) values ($1,$2,'v',now() - make_interval(hours => $3))`, [u, doc, hoursAgo]);

ok("sem nenhum aceite: dados sensíveis NÃO valem", (await rc(U.C)) === false);
await addAt(U.C, "dados_sensiveis", 500);
ok("aceite de 500 horas atrás VALE (sem limite de 2 h)", (await rc(U.C)) === true);
ok("o aceite de uma pessoa não vale para outra", (await rc(U.C2)) === false);
await addAt(U.C, "dados_sensiveis_retirada", 1);
ok("depois da retirada, NÃO vale mais", (await rc(U.C)) === false);
await addAt(U.C, "dados_sensiveis", 0);
ok("aceitar de novo depois da retirada volta a valer", (await rc(U.C)) === true);
ok("retirada anterior a um aceite novo não derruba o aceite novo (ordem por data)", (await rc(U.C)) === true);

// demais documentos mantêm a regra de 2 horas
await addAt(U.C2, "checkout_ritual", 3);
ok("outros documentos: aceite de 3 h atrás não vale (regra antiga mantida)", (await rc(U.C2, "checkout_ritual")) === false);
await addAt(U.C2, "checkout_ritual", 0);
ok("outros documentos: aceite recente vale", (await rc(U.C2, "checkout_ritual")) === true);
ok("o aceite de dados sensíveis não conta para outro documento", (await rc(U.C, "checkout_servico")) === false);

// função de retirada
r = await as("anon", null, (c) => q(c, `select withdraw_sensitive_consent('v')`));
ok("ataque: visitante não retira (sem permissão)", Boolean(r.err), r.err ?? "executou");
r = await as("authenticated", U.C2, (c) => q(c, `select withdraw_sensitive_consent('v') id`));
ok("sem aceite de dados sensíveis, retirar não faz nada (devolve nulo)", !r.err && r.rows[0].id === null, r.err ?? "");
ok("…e nada foi gravado", (await su.query(`select count(*)::int n from legal_consents where user_id=$1 and doc_key='dados_sensiveis_retirada'`, [U.C2])).rows[0].n === 0);
r = await as("authenticated", U.C, (c) => q(c, `select withdraw_sensitive_consent('2026-10-rascunho-2') id`));
ok("com aceite vigente, a retirada grava e devolve o id", !r.err && Boolean(r.rows[0].id), r.err ?? "");
ok("depois de retirar, não vale", (await rc(U.C)) === false);
const wrow = (await su.query(`select doc_version from legal_consents where id=$1`, [r.rows?.[0]?.id])).rows[0];
ok("a retirada guarda a versão do texto", wrow?.doc_version === "2026-10-rascunho-2");
r = await as("authenticated", U.C, (c) => q(c, `select withdraw_sensitive_consent('v') id`));
ok("retirar duas vezes é inofensivo (segunda devolve nulo, sem novo registro)", !r.err && r.rows[0].id === null && (await su.query(`select count(*)::int n from legal_consents where user_id=$1 and doc_key='dados_sensiveis_retirada'`, [U.C])).rows[0].n === 2);
r = await as("authenticated", U.C, (c) => q(c, `select withdraw_sensitive_consent('') id`));
ok("versão vazia é recusada", Boolean(r.err));
r = await as("authenticated", U.C, (c) => q(c, `select withdraw_sensitive_consent($1) id`, ["x".repeat(61)]));
ok("versão acima de 60 caracteres é recusada", Boolean(r.err));

// forja e privilégios
r = await as("authenticated", U.C, (c) => q(c, `select record_consent('dados_sensiveis_retirada','v')`));
ok("ataque: 'record_consent' não aceita gravar a retirada (só a função própria)", Boolean(r.err), r.err ?? "gravou");
r = await as("authenticated", U.C, (c) => q(c, `insert into legal_consents(user_id,doc_key,doc_version) values ($1,'dados_sensiveis','v')`, [U.C]));
ok("ataque: cliente não grava aceite direto na tabela", Boolean(r.err), r.err ?? "gravou");
r = await as("authenticated", U.C, (c) => q(c, `update legal_consents set doc_key='dados_sensiveis' where user_id=$1`, [U.C]));
ok("ataque: cliente não altera registros de aceite", (r.err ? true : r.n === 0), r.err ?? `${r.n} linhas`);
r = await as("authenticated", U.C, (c) => q(c, `delete from legal_consents where user_id=$1`, [U.C]));
ok("ataque: cliente não apaga registros de aceite", (r.err ? true : r.n === 0), r.err ?? `${r.n} linhas`);
r = await as("authenticated", U.C, (c) => q(c, `select count(*)::int n from legal_consents`));
ok("cliente lê só os próprios aceites", !r.err && r.rows[0].n === (await su.query(`select count(*)::int n from legal_consents where user_id=$1`, [U.C])).rows[0].n, r.err ?? r.rows[0].n);
ok("has_recent_consent segue fechada para cliente e visitante", !(await priv("authenticated", "public.has_recent_consent(uuid,text,integer)")) && !(await priv("anon", "public.has_recent_consent(uuid,text,integer)")));
ok("withdraw_sensitive_consent: cliente executa, visitante não", (await priv("authenticated", "public.withdraw_sensitive_consent(text)")) && !(await priv("anon", "public.withdraw_sensitive_consent(text)")));

// compra de serviço com pagamento ligado: exige o aceite vigente
await su.query(`update platform_settings set value='{"payments":{"state":"on"},"calendar":{"state":"on"}}'::jsonb where key='features'`);
await su.query(`insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_H','ativa',true,true) on conflict do nothing`, [HID, U.H]).catch(() => null);
await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_casa','v') on conflict do nothing`, [U.H]).catch(() => null);
const SV = (await su.query(`insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Trabalho X',$2,20000,true,'transmissao',false,60) returning id`, [HID, "Descrição suficiente para o teste do serviço de pagamento"])).rows[0].id;
await su.query(`delete from legal_consents where user_id=$1 and doc_key='dados_sensiveis_retirada'`, [U.C]);
await su.query(`delete from legal_consents where user_id=$1 and doc_key='dados_sensiveis'`, [U.C]);
await su.query(`insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_cliente','v')`, [U.C]);
r = await as("authenticated", U.C, (c) => q(c, `select create_service_order($1,'x') id`, [SV]));
ok("compra sem aceite de dados sensíveis é recusada", Boolean(r.err) && /aceite|condi/i.test(r.err), r.err ?? "criou");
await addAt(U.C, "dados_sensiveis", 300);
r = await as("authenticated", U.C, (c) => q(c, `select create_service_order($1,'x') id`, [SV]));
ok("compra com aceite antigo (300 h) e ainda vigente é aceita", !r.err, r.err ?? "");
await as("authenticated", U.C, (c) => q(c, `select withdraw_sensitive_consent('v')`));
r = await as("authenticated", U.C, (c) => q(c, `select create_service_order($1,'x') id`, [SV]));
ok("depois de retirar, a compra volta a ser recusada", Boolean(r.err) && /aceite|condi/i.test(r.err), r.err ?? "criou");
r = await as("authenticated", U.C, (c) => q(c, `select reserve_event(gen_random_uuid()) id`));
ok("reserve_event segue chamando a regra (evento inexistente não passa)", Boolean(r.err), r.err ?? "");

console.log(`\n${bad === 0 ? "TODAS AS VERIFICAÇÕES PASSARAM" : bad + " FALHA(S)"}`);
await su.end();
process.exit(bad ? 1 : 0);
