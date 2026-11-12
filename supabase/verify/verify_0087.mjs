// Verificação LOCAL da migration 0087 (base da cobrança: configuração, preços e dias úteis): aplica 0001–0087 num PostgreSQL 16 e ataca.
// Uso: node supabase/verify/verify_0087.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0087", { with64: true, max: 87 });
ok("migrations 0001–0087 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(readFileSync(new URL("../migrations/0087_cobranca_base.sql", import.meta.url), "utf8").split("-- ============ 5) permissões ============")[1]);
const as = async (role, uid, fn) => { const c = await connect("vf0087"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const ADM = "a1000000-0000-0000-0000-0000000000a1", USR = "c0000000-0000-0000-0000-00000000000c";
await su.query("insert into auth.users(id,email) values ($1,'adm@x'),($2,'usr@x')", [ADM, USR]);
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
const j = (o) => JSON.stringify(o);

// --- valores iniciais ---
let r = await q(su, "select public.billing_config_ok(public.billing_config_default()) a, public.billing_prices_ok(public.billing_prices_default()) b");
ok("valores iniciais são válidos", r.rows[0]?.a === true && r.rows[0].b === true, j(r));
r = await q(su, "select key, value from public.platform_settings where key in ('billing_config','billing_prices') order by key");
ok("as duas chaves foram criadas", r.rows.length === 2);
r = await q(su, "select public.platform_billing_config() c, public.platform_billing_prices() p");
ok("cobrança nasce DESLIGADA, tolerância 3 dias úteis, aviso 3 dias, Stripe em tudo", r.rows[0]?.c.enabled === false && r.rows[0].c.tolerance_business_days === 3 && r.rows[0].c.notice_days === 3 && Object.values(r.rows[0].c.provider).every((x) => x === "stripe"), j(r.rows[0]?.c));
ok("preços iniciais: vaga 29,90/39,90/39,90; pacotes 19,90/49,90/89,90; destaque e impulsionamento em branco", r.rows[0]?.p.extra_seat.base === 2990 && r.rows[0].p.extra_seat.maximo === 3990 && r.rows[0].p.credit_pack.p80 === 1990 && r.rows[0].p.credit_pack.p500 === 8990 && r.rows[0].p.highlight === null && r.rows[0].p.boost === null);

// --- ataques à validação ---
const cfg = () => JSON.parse(JSON.stringify(JSON.parse(readFileSync(new URL("../migrations/0087_cobranca_base.sql", import.meta.url), "utf8").match(/select '(\{"enabled".*?\})'::jsonb;/)[1])));
const pri = () => JSON.parse(readFileSync(new URL("../migrations/0087_cobranca_base.sql", import.meta.url), "utf8").match(/select '(\{"extra_seat".*?\})'::jsonb;/)[1]);
const okCfg = async (m) => (await q(su, "select public.billing_config_ok($1::jsonb) v", [j(m)])).rows[0]?.v;
const okPri = async (m) => (await q(su, "select public.billing_prices_ok($1::jsonb) v", [j(m)])).rows[0]?.v;
const mod = (base, f) => { const o = JSON.parse(j(base)); f(o); return o; };
const cfgCases = {
  "enabled como texto": (o) => (o.enabled = "true"), "enabled ausente": (o) => delete o.enabled, "chave extra": (o) => (o.x = 1),
  "aviso 0": (o) => (o.notice_days = 0), "aviso 16": (o) => (o.notice_days = 16), "aviso decimal": (o) => (o.notice_days = 3.5), "aviso texto": (o) => (o.notice_days = "3"),
  "tolerância 11": (o) => (o.tolerance_business_days = 11), "tolerância negativa": (o) => (o.tolerance_business_days = -1),
  "provedor maiúsculo": (o) => (o.provider.plan = "Stripe"), "provedor com ponto e vírgula": (o) => (o.provider.plan = "x;drop"), "provedor vazio": (o) => (o.provider.plan = ""), "provedor número": (o) => (o.provider.plan = 5),
  "provedor sem uma cobrança": (o) => delete o.provider.boost, "provedor com cobrança extra": (o) => (o.provider.novo = "stripe"),
  "meios vazios": (o) => (o.methods.plan = []), "meio desconhecido": (o) => (o.methods.plan = ["boleto"]), "meio repetido": (o) => (o.methods.plan = ["pix", "pix"]), "meio não é texto": (o) => (o.methods.plan = [1]), "meios como texto": (o) => (o.methods.plan = "pix"),
  "meios sem uma cobrança": (o) => delete o.methods.credit_pack,
};
ok("configuração inicial passa no validador", await okCfg(cfg()) === true);
for (const [n, f] of Object.entries(cfgCases)) ok(`configuração inválida recusada: ${n}`, (await okCfg(mod(cfg(), f))) === false);
for (const v of [null, [], "x", 5]) ok(`configuração não-objeto recusada: ${j(v)}`, (await okCfg(v)) === false);
ok("configuração: aviso 1 e 15, tolerância 0 e 10 valem", (await okCfg(mod(cfg(), (o) => { o.notice_days = 1; o.tolerance_business_days = 0; }))) === true && (await okCfg(mod(cfg(), (o) => { o.notice_days = 15; o.tolerance_business_days = 10; }))) === true);
ok("configuração: outro provedor de formato válido (efi) vale", (await okCfg(mod(cfg(), (o) => (o.provider.plan = "efi")))) === true);
const priCases = {
  "abaixo de R$ 1": (o) => (o.extra_seat.base = 99), "acima de R$ 10.000": (o) => (o.credit_pack.p80 = 1000001), "texto": (o) => (o.extra_seat.base = "2990"), "decimal": (o) => (o.extra_seat.base = 29.9),
  "negativo": (o) => (o.credit_pack.p200 = -1), "chave extra": (o) => (o.x = 1), "falta destaque": (o) => delete o.highlight, "falta plano da vaga": (o) => delete o.extra_seat.maximo,
  "pacote extra": (o) => (o.credit_pack.p999 = 500), "destaque abaixo do mínimo": (o) => (o.highlight = 5), "impulsionamento texto": (o) => (o.boost = "10"),
};
ok("preços iniciais passam no validador", await okPri(pri()) === true);
for (const [n, f] of Object.entries(priCases)) ok(`preços inválidos recusados: ${n}`, (await okPri(mod(pri(), f))) === false);
ok("destaque e impulsionamento com valor válido passam", (await okPri(mod(pri(), (o) => { o.highlight = 4990; o.boost = 1990; }))) === true);

// --- gravação pelo administrador ---
const set = (uid, key, val) => as("authenticated", uid, (c) => q(c, "select public.admin_set_setting($1,$2::jsonb)", [key, j(val)]));
r = await set(ADM, "billing_config", mod(cfg(), (o) => (o.notice_days = 5))); ok("administrador grava configuração válida", !r.err, r.err);
r = await q(su, "select value from public.platform_settings where key='billing_config'"); ok("valor gravado e lido pelo banco", r.rows[0]?.value.notice_days === 5);
r = await q(su, "select public.platform_billing_config() c"); ok("leitura reflete a mudança", r.rows[0]?.c.notice_days === 5);
r = await set(ADM, "billing_config", mod(cfg(), (o) => (o.notice_days = 99))); ok("administrador não grava configuração inválida (mensagem clara)", !!r.err && /Configuração de cobrança inválida/.test(r.err), r.err);
r = await set(ADM, "billing_prices", mod(pri(), (o) => (o.credit_pack.p80 = 50))); ok("administrador não grava preço inválido", !!r.err && /Preços de cobrança inválidos/.test(r.err), r.err);
r = await set(ADM, "billing_prices", mod(pri(), (o) => { o.highlight = 4990; })); ok("administrador grava preço de destaque", !r.err, r.err);
r = await set(USR, "billing_config", cfg()); ok("usuário comum não grava", !!r.err && /not_admin/.test(r.err), r.err);
r = await as("anon", null, (c) => q(c, "select public.admin_set_setting('billing_config','{}'::jsonb)")); ok("anon não grava", !!r.err, r.err);
r = await q(su, "select count(*) n from public.admin_audit where key in ('billing_config','billing_prices')"); ok("alterações ficaram no histórico (antes/depois)", Number(r.rows[0].n) === 2, r.rows[0].n);
r = await set(ADM, "chave_inventada", cfg()); ok("chave desconhecida segue recusada", !!r.err && /invalid_key/.test(r.err), r.err);
r = await set(ADM, "payment_limits", { max_cents: 500000 }); ok("outras chaves continuam funcionando (teto de pagamento)", !r.err, r.err);
r = await set(ADM, "payment_limits", { max_cents: 5 }); ok("validações antigas continuam valendo", !!r.err, r.err);
r = await set(ADM, "plan_matrix", { x: 1 }); ok("matriz de planos segue validada", !!r.err && /Matriz de planos inválida/.test(r.err), r.err);
r = await q(su, "update public.platform_settings set value = '{\"lixo\":1}' where key='billing_config'"); r = await q(su, "select public.platform_billing_config() c");
ok("configuração corrompida no banco cai nos valores iniciais (nunca sem regra)", r.rows[0]?.c.enabled === false && r.rows[0].c.notice_days === 3, j(r.rows[0]?.c));
await q(su, "delete from public.platform_settings where key='billing_prices'"); r = await q(su, "select public.platform_billing_prices() p"); ok("preços ausentes caem nos valores iniciais", r.rows[0]?.p.credit_pack.p500 === 8990);
r = await q(su, "insert into public.platform_settings(key,value) values ('qualquer','{}')"); ok("a trava de chaves da tabela segue valendo", !!r.err, r.err);

// --- dias úteis ---
const bd = async (d) => (await q(su, "select public.billing_is_business_day($1::date) v", [d])).rows[0]?.v;
ok("sexta 13/11/2026 é dia útil", (await bd("2026-11-13")) === true);
ok("sábado e domingo não são", (await bd("2026-11-14")) === false && (await bd("2026-11-15")) === false);
ok("segunda 16/11 é útil", (await bd("2026-11-16")) === true);
ok("20/11 (Consciência Negra, sexta) é feriado", (await bd("2026-11-20")) === false);
ok("Sexta-feira Santa 2027 (26/03) é feriado", (await bd("2027-03-26")) === false);
ok("data nula não é dia útil", (await q(su, "select public.billing_is_business_day(null) v")).rows[0].v === false);
const add = async (d, n) => (await q(su, "select to_char(public.billing_add_business_days($1::date,$2),'YYYY-MM-DD') v", [d, n]));
ok("sexta 13/11 + 3 dias úteis = quarta 18/11", (await add("2026-11-13", 3)).rows[0]?.v === "2026-11-18");
ok("quinta 19/11 + 3 pula o feriado de 20/11 e o fim de semana = quarta 25/11", (await add("2026-11-19", 3)).rows[0]?.v === "2026-11-25");
ok("sábado + 1 dia útil = segunda", (await add("2026-11-14", 1)).rows[0]?.v === "2026-11-16");
ok("n = 0 devolve a própria data", (await add("2026-11-14", 0)).rows[0]?.v === "2026-11-14");
ok("virada de ano: 30/12/2026 + 2 = 04/01/2027 (31/12 útil, 01/01 feriado, 02-03 fim de semana)", (await add("2026-12-30", 2)).rows[0]?.v === "2027-01-04", (await add("2026-12-30", 2)).rows[0]?.v);
for (const [d, n] of [["2026-11-13", -1], ["2026-11-13", 61], [null, 1], ["2026-11-13", null]]) ok(`parâmetros inválidos recusados: ${d}, ${n}`, !!(await add(d, n)).err);

// --- feriados (administrador) ---
const hol = (uid, ...a) => as("authenticated", uid, (c) => q(c, "select public.admin_set_billing_holiday($1::date,$2,$3)", a));
r = await hol(ADM, "2026-12-24", "Véspera de Natal (ponto da casa)", false); ok("administrador inclui feriado", !r.err, r.err);
ok("a data incluída deixa de ser dia útil", (await bd("2026-12-24")) === false);
r = await hol(ADM, "2026-12-24", null, true); ok("administrador remove feriado", !r.err, r.err);
ok("a data removida volta a ser dia útil", (await bd("2026-12-24")) === true);
r = await hol(USR, "2026-12-24", "Tentativa", false); ok("usuário comum não altera feriados", !!r.err && /not_admin/.test(r.err), r.err);
r = await hol(ADM, "2026-12-24", "x", false); ok("nome curto recusado", !!r.err, r.err);
r = await hol(ADM, "2040-01-01", "Longe demais", false); ok("data fora do intervalo recusada", !!r.err, r.err);
r = await hol(ADM, null, "Sem data", false); ok("data nula recusada", !!r.err, r.err);
r = await q(su, "select count(*) n from public.admin_audit where key='billing_holiday'"); ok("alterações de feriado ficaram no histórico", Number(r.rows[0].n) === 2, r.rows[0].n);
r = await as("authenticated", USR, (c) => q(c, "select count(*) n from public.billing_holidays")); ok("usuário comum não lê feriados (RLS)", r.rows?.[0]?.n === "0", j(r));
r = await as("authenticated", ADM, (c) => q(c, "select count(*) n from public.billing_holidays")); ok("administrador lê feriados", Number(r.rows?.[0]?.n) >= 30, j(r));
r = await as("authenticated", ADM, (c) => q(c, "insert into public.billing_holidays(day,name) values ('2026-12-31','Direto')")); ok("nem o administrador grava direto na tabela", !!r.err, r.err);

// --- permissões ---
const hasFn = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
for (const sig of ["public.platform_billing_config()", "public.platform_billing_prices()", "public.billing_is_business_day(date)", "public.billing_add_business_days(date,int)", "public.billing_config_ok(jsonb)", "public.billing_prices_ok(jsonb)", "public.admin_set_billing_holiday(date,text,boolean)"]) ok(`anon não executa ${sig}`, !(await hasFn("anon", sig)));
for (const sig of ["public.platform_billing_config()", "public.billing_is_business_day(date)", "public.billing_add_business_days(date,int)", "public.billing_config_ok(jsonb)"]) ok(`authenticated não executa ${sig}`, !(await hasFn("authenticated", sig)));
ok("authenticated executa a função do administrador (com trava interna)", await hasFn("authenticated", "public.admin_set_billing_holiday(date,text,boolean)"));
ok("service_role lê configuração e dias úteis", (await hasFn("service_role", "public.platform_billing_config()")) && (await hasFn("service_role", "public.billing_add_business_days(date,int)")));
await su.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);
