// Verificação LOCAL da migration 0096 (autorização de cobrança automática no cartão).
// Uso: node supabase/verify/verify_0096.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0096", { with64: true, max: 96 });
ok("migrations 0001–0096 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
await su.query(part("0088_cobranca_motor.sql", "-- ============ 13) permissões ============"));
await su.query(part("0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"));
await su.query(part("0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"));
await su.query(part("0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"));
await su.query(part("0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"));
await su.query(part("0096_autorizacao_cobranca_automatica.sql", "-- ============ 7) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0096"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const ADM = "a1000000-0000-0000-0000-0000000000a1", OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2", CLI = "c1000000-0000-0000-0000-0000000000c1";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2";
for (const [u, t] of [[ADM, "cliente"], [OWN_A, "casa"], [OWN_B, "casa"], [CLI, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','intermediario'), ($3,$4,'Casa B','casa-b','intermediario')", [HA, OWN_A, HB, OWN_B]);
const TXT = "Li e concordo com os Termos de Uso do Ilê Conecta e autorizo a cobrança automática recorrente no valor de R$ 179,90 a cada mês no cartão de crédito informado, referente ao plano Profissional, até que eu solicite o cancelamento.";
const authz = (uid, over = {}) => as("authenticated", uid, (cc) => q(cc, "select public.platform_card_authorize($1,$2,$3::bigint,$4,$5) id", [over.v ?? "2026-11-rascunho-3", "plan" in over ? over.plan : "profissional", over.amt === undefined ? 17990 : over.amt, "period" in over ? over.period : "mensal", over.text ?? TXT]));

// ---------- 1) tipo de aceite ----------
let r = await sv("insert into legal_consents(user_id,doc_key,doc_version) values ($1,'cobranca_automatica','v')", [OWN_A]); ok("o aceite 'cobranca_automatica' é aceito pela tabela", !r.err, r.err);
r = await sv("insert into legal_consents(user_id,doc_key,doc_version) values ($1,'dados_sensiveis_retirada','v')", [OWN_A]); ok("os tipos que já existiam seguem aceitos (retirada de dados sensíveis)", !r.err, r.err);
r = await sv("insert into legal_consents(user_id,doc_key,doc_version) values ($1,'qualquer_coisa','v')", [OWN_A]); ok("tipo desconhecido segue recusado", !!r.err);
await sv("delete from legal_consents where user_id=$1", [OWN_A]).catch(() => {});

// ---------- 2) a casa autoriza ----------
r = await authz(OWN_A); const aid = r.rows?.[0]?.id; ok("a casa A autoriza e recebe o número do registro", !r.err && !!aid, r.err);
r = await sv("select c.doc_key, c.doc_version, c.context_id, a.house_id, a.user_id, a.plan_key, a.amount_cents::int amt, a.period, a.text_shown from house_auto_authorizations a join legal_consents c on c.id = a.consent_id where a.id=$1", [aid]);
const row = r.rows?.[0];
ok("grava o aceite (versão e casa) e o texto exato, o plano, o valor e a periodicidade", row?.doc_key === "cobranca_automatica" && row.doc_version === "2026-11-rascunho-3" && row.context_id === HA && row.house_id === HA && row.user_id === OWN_A && row.plan_key === "profissional" && row.amt === 17990 && row.period === "mensal" && row.text_shown === TXT, JSON.stringify(row));
r = await authz(OWN_A, { plan: null, amt: null }); ok("sem plano pago ainda: grava com plano e valor vazios", !r.err && (await sv("select plan_key, amount_cents from house_auto_authorizations where id=$1", [r.rows[0].id])).rows[0].plan_key === null, r.err);
r = await as("anon", null, (cc) => q(cc, "select public.platform_card_authorize('v','p',1,'mensal',$1)", [TXT])); ok("visitante não autoriza", !!r.err);
r = await authz(CLI); ok("quem não tem casa não autoriza", !!r.err && /Somente a casa/.test(r.err), r.err);
r = await authz(OWN_A, { period: "semanal" }); ok("periodicidade inválida é recusada", !!r.err && /Periodicidade/.test(r.err), r.err);
r = await authz(OWN_A, { period: null }); ok("periodicidade vazia é recusada", !!r.err);
r = await authz(OWN_A, { amt: -1 }); ok("valor negativo é recusado", !!r.err && /Valor/.test(r.err), r.err);
r = await authz(OWN_A, { text: "curto" }); ok("texto curto demais é recusado", !!r.err && /Texto/.test(r.err), r.err);
r = await authz(OWN_A, { text: "x".repeat(1501) }); ok("texto longo demais é recusado", !!r.err && /Texto/.test(r.err), r.err);
r = await authz(OWN_A, { v: "  " }); ok("versão vazia é recusada", !!r.err && /Versão/.test(r.err), r.err);
r = await authz(OWN_A, { v: "v".repeat(61) }); ok("versão longa demais é recusada", !!r.err && /Versão/.test(r.err), r.err);
const nRows = Number((await sv("select count(*) n from house_auto_authorizations")).rows[0].n);
ok("as recusas não deixam registro pela metade (aceite e autorização andam juntos)", nRows === 2 && Number((await sv("select count(*) n from legal_consents where doc_key='cobranca_automatica' and user_id=$1", [OWN_A])).rows[0].n) === 2, nRows);

// ---------- 3) o servidor confere ----------
const okAuth = async (h, m) => (await sv(m === undefined ? "select public.platform_card_auth_ok($1) v" : "select public.platform_card_auth_ok($1,$2) v", m === undefined ? [h] : [h, m])).rows[0].v;
ok("casa A tem autorização recente", (await okAuth(HA)) === true);
ok("casa B não tem (a autorização é de cada casa)", (await okAuth(HB)) === false);
ok("casa desconhecida: não", (await okAuth("00000000-0000-0000-0000-000000000000")) === false);
await su.query("alter table house_auto_authorizations disable trigger trg_house_auto_authorizations_guard");
await su.query("update house_auto_authorizations set created_at = now() - interval '61 minutes' where house_id=$1", [HA]);
await su.query("alter table house_auto_authorizations enable trigger trg_house_auto_authorizations_guard");
ok("passados 60 minutos, a autorização deixa de valer", (await okAuth(HA)) === false);
ok("com janela maior (2 horas) ainda vale, e o teto da janela é 24 horas", (await okAuth(HA, 120)) === true && (await okAuth(HA, 99999)) === true);
await su.query("alter table house_auto_authorizations disable trigger trg_house_auto_authorizations_guard");
await su.query("update house_auto_authorizations set created_at = now() - interval '25 hours' where house_id=$1", [HA]);
await su.query("alter table house_auto_authorizations enable trigger trg_house_auto_authorizations_guard");
ok("passadas 25 horas, nem a janela máxima aceita", (await okAuth(HA, 99999)) === false);

// ---------- 4) ninguém altera nem apaga ----------
r = await sv("update house_auto_authorizations set amount_cents = 1 where id=$1", [aid]); ok("a autorização não é alterada (nem pelo servidor)", !!r.err && /não pode ser alterada/.test(r.err), r.err);
r = await sv("delete from house_auto_authorizations where id=$1", [aid]); ok("a autorização não é apagada", !!r.err, r.err);
r = await sv("delete from legal_consents where id = (select consent_id from house_auto_authorizations where id=$1)", [aid]); ok("o aceite ligado a ela não pode ser apagado", !!r.err, r.err);

// ---------- 5) leitura e permissões ----------
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from house_auto_authorizations")); ok("a casa A lê as próprias autorizações", Number(r.rows?.[0]?.n) === 2, JSON.stringify(r));
r = await as("authenticated", OWN_B, (cc) => q(cc, "select count(*) n from house_auto_authorizations")); ok("a casa B não lê as da A", r.rows?.[0]?.n === "0", JSON.stringify(r));
r = await as("authenticated", ADM, (cc) => q(cc, "select count(*) n from house_auto_authorizations")); ok("a administração lê todas", Number(r.rows?.[0]?.n) === 2, JSON.stringify(r));
r = await as("authenticated", OWN_A, (cc) => q(cc, "insert into house_auto_authorizations(house_id,user_id,consent_id,period,text_shown) select house_id,user_id,consent_id,'mensal',text_shown from house_auto_authorizations limit 1")); ok("a casa não escreve direto na tabela", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "update house_auto_authorizations set amount_cents = 1")); ok("a casa não altera", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "delete from house_auto_authorizations")); ok("a casa não apaga", !!r.err, r.err);
r = await as("anon", null, (cc) => q(cc, "select count(*) from house_auto_authorizations")); ok("visitante não lê", !!r.err, r.err);
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
ok("platform_card_auth_ok: só o servidor executa", !(await hasFn("anon", "public.platform_card_auth_ok(uuid,int)")) && !(await hasFn("authenticated", "public.platform_card_auth_ok(uuid,int)")) && (await hasFn("service_role", "public.platform_card_auth_ok(uuid,int)")));
ok("platform_card_authorize: logado e servidor executam, visitante não", !(await hasFn("anon", "public.platform_card_authorize(text,text,bigint,text,text)")) && (await hasFn("authenticated", "public.platform_card_authorize(text,text,bigint,text,text)")) && (await hasFn("service_role", "public.platform_card_authorize(text,text,bigint,text,text)")));
ok("o gatilho de proteção não é executável por visitante nem logado", !(await hasFn("anon", "public.house_auto_authorizations_guard()")) && !(await hasFn("authenticated", "public.house_auto_authorizations_guard()")));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.platform_card_auth_ok($1)", [HA])); ok("a casa não consulta sozinha a conferência do servidor", !!r.err, r.err);

// ---------- 6) o que já existia continua igual ----------
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.record_consent('termos_casa','2026-11-rascunho-3') id")); ok("record_consent segue gravando os termos da casa", !r.err && !!r.rows?.[0]?.id, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.record_consent('cobranca_automatica','v')")); ok("a autorização não se grava pelo caminho comum (só por platform_card_authorize, com o texto)", !!r.err && /Documento inválido/.test(r.err), r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
