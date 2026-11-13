// Verificação LOCAL da migration 0100 (reajuste da tabela comercial com aviso de 30 dias).
// Uso: node supabase/verify/verify_0100.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0100", { with64: true, max: 100 });
ok("migrations 0001–0100 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
await su.query(part("0088_cobranca_motor.sql", "-- ============ 13) permissões ============"));
await su.query(part("0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"));
await su.query(part("0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"));
await su.query(part("0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"));
await su.query(part("0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"));
await su.query(part("0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"));
await su.query(part("0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"));
await su.query(part("0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0100"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
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
const dateOf = (offsetDays) => sv("select (current_date + $1::int)::text d", [offsetDays]).then((r) => r.rows[0].d);
const noon = (d) => `${d} 12:00:00-03`; // meio-dia de Brasília do dia d
const issue = async (h, due, key, kind = "plan", item = "plan:intermediario", amt = 17990) => (async () => { const x = await sv("select public.platform_charge_issue($1,$2,$3,$4,$5::date,$5::date,'Mensalidade do plano',$6) id", [h, kind, item, amt, due, key]); if (x.err) throw new Error("issue: " + x.err); return x.rows[0].id; })();
const dueList = async (now) => (await sv("select * from public.platform_autocharge_due($1::timestamptz)", [now])).rows;
const notes = async (owner) => (await sv("select text from notifications where user_id=$1 order by created_at, id", [owner])).rows.map((x) => x.text);
const save = async (h, setup, cust = "cus_A", pm = "pm_A", last4 = "4242") => sv("select public.platform_card_save($1,'stripe',$2,$3,$4,'visa',$5,12,2030) r", [h, setup, cust, pm, last4]);

await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
let pn = 0, nn;


await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const T0 = new Date(Date.now() + 60000).toISOString(); // logo após os pagamentos do teste (paid_at = agora)
// emite e paga uma cobrança (como o provedor faria)
const pay = async (h, { kind = "plan", item = "plan:intermediario", amt = 17990, at = T0, due = "2026-11-10", pm = "card" } = {}) => {
  const id = await issue(h, due, `pay-${++pn}-${h.slice(0, 4)}`, kind, item, amt);
  const ref = `cs_plan_${pn}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,$3,null)", [id, ref, pm]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59,$3::timestamptz)", [ref, amt, at]);
  if (r.err) throw new Error(r.err);
  return { id, amt, ref };
};
const refundRow = async (id) => (await sv("select * from platform_plan_refunds where id=$1", [id])).rows[0];
const begin = (h, ch, now = null) => sv("select public.platform_plan_refund_begin($1,$2,null,coalesce($3::timestamptz, now())) r", [h, ch, now]);
const level = async (h) => (await sv("select public.house_billing_level($1) l", [h])).rows[0].l;
const mine = async (uid) => (await as("authenticated", uid, (cc) => q(cc, "select public.my_plan_refund() s"))).rows?.[0]?.s;

await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const HC = "d3000000-0000-0000-0000-0000000000d3";
await sv("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa C','casa-c','maximo')", [HC, CLI]);
for (const h of [HA, HB, HC]) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,'2026-10-10',true)", [h]);
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
const today = (await sv("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d;
const plus = async (n) => (await sv("select ($1::date + $2::int)::text d", [today, n])).rows[0].d;
const centsNow = async (plan, on = today) => Number((await sv("select public.platform_plan_monthly_cents($1,$2::date) c", [plan, on])).rows[0].c);
const annAs = (uid, plan, val, eff, why = "reajuste anual") => as("authenticated", uid, (cc) => q(cc, "select public.admin_price_announce($1,$2,$3::date,$4) r", [plan, val, eff, why]));
const nNotes = async (u, like) => Number((await sv("select count(*) n from notifications where user_id=$1 and text like $2", [u, like])).rows[0].n);
const OLD = await centsNow("intermediario");
const NEWV = (OLD + 3000) / 100;
const EFF = await plus(40);

// ---------- 1) quem pode anunciar e o que é aceito ----------
let r = await annAs(OWN_A, "intermediario", NEWV, EFF); ok("a casa não anuncia reajuste", !!r.err, r.err);
r = await annAs(ADM, "intermediario", NEWV, await plus(29)); ok("vigência com menos de 30 dias é recusada", !!r.err && /30 dias/.test(r.err), r.err);
r = await annAs(ADM, "intermediario", NEWV, await plus(500)); ok("vigência muito distante é recusada", !!r.err, r.err);
r = await annAs(ADM, "intermediario", OLD / 100, EFF); ok("valor igual ao atual não é reajuste", !!r.err && /Redução|aumento/.test(r.err), r.err);
r = await annAs(ADM, "intermediario", (OLD - 100) / 100, EFF); ok("redução não passa pelo reajuste (vale na hora, direto na tabela)", !!r.err, r.err);
r = await annAs(ADM, "premium", NEWV, EFF); ok("plano inexistente é recusado", !!r.err && /Plano inválido/.test(r.err), r.err);
r = await annAs(ADM, "intermediario", 0, EFF); ok("valor zero é recusado", !!r.err, r.err);
r = await annAs(ADM, "intermediario", 99999999, EFF); ok("valor absurdo é recusado", !!r.err, r.err);

// ---------- 2) anunciar avisa as casas do plano ----------
r = await annAs(ADM, "intermediario", NEWV, EFF, "reajuste anual de teste"); const A1 = r.rows?.[0]?.r;
ok("anuncia o reajuste: avisa as 2 casas matriculadas no plano", !r.err && A1.notified === 2 && A1.old_cents === OLD && A1.new_cents === OLD + 3000, r.err || JSON.stringify(A1));
const note = (await sv("select text, href from notifications where user_id=$1 and text like 'Atualização da tabela comercial:%'", [OWN_A])).rows[0];
ok("o aviso traz a data, o valor antigo e o novo, e leva para Planos", !!note && note.text.includes(EFF.split("-").reverse().join("/")) && note.text.includes("para R$") && note.text.includes("fale com o suporte") && note.href === "/planos", JSON.stringify(note));
ok("quem não está nesse plano não recebe (casa C é Premium)", (await nNotes(CLI, "Atualização da tabela comercial:%")) === 0);
ok("o aviso nasce sem leitura registrada (a leitura é gravada quando a pessoa abre)", (await sv("select count(*) n from notifications where user_id=$1 and text like 'Atualização da tabela comercial:%' and read_at is null", [OWN_A])).rows[0].n === "1");
ok("auditoria do anúncio registrada", Number((await sv("select count(*) n from admin_audit where key='price_announce'")).rows[0].n) === 1);
r = await annAs(ADM, "intermediario", NEWV + 10, EFF); ok("só um reajuste anunciado por plano", !!r.err, r.err);
r = await sv("update platform_price_changes set new_cents = 1000000 where id=$1", [A1.id]); ok("valor anunciado não muda depois (nem pelo servidor)", !!r.err, r.err);
r = await sv("update platform_price_changes set effective_on = effective_on + 60 where id=$1", [A1.id]); ok("data anunciada não muda depois", !!r.err, r.err);
r = await sv("delete from platform_price_changes where id=$1", [A1.id]); ok("reajuste anunciado não é apagado", !!r.err, r.err);

// ---------- 3) o valor depende da data da renovação ----------
ok("hoje o valor segue o antigo", (await centsNow("intermediario")) === OLD);
ok("na véspera da vigência o valor ainda é o antigo", (await centsNow("intermediario", await plus(39))) === OLD);
ok("na data de vigência o valor é o novo", (await centsNow("intermediario", EFF)) === OLD + 3000);
ok("depois da vigência o valor é o novo", (await centsNow("intermediario", await plus(60))) === OLD + 3000);
ok("outros planos não mudam", (await centsNow("maximo", EFF)) === (await centsNow("maximo")));

// ---------- 4) a rotina de faturas respeita a data ----------
const t1 = new Date(Date.parse(EFF + "T12:00:00-03:00") - 25 * 864e5).toISOString(); // renovação do mês anterior à vigência
await sv("select public.platform_billing_tick($1::timestamptz)", [t1]);
const before = (await sv("select amount_cents a, due_date::text d from platform_charges where house_id=$1 and kind='plan' and idempotency_key like 'plan:%' order by due_date", [HA])).rows;
ok("renovação com vencimento antes da vigência sai com o valor antigo", before.length >= 1 && before.every((x) => x.d < EFF ? Number(x.a) === OLD : true), JSON.stringify(before));
const t2 = new Date(Date.parse(EFF + "T12:00:00-03:00") + 12 * 864e5).toISOString();
await sv("select public.platform_billing_tick($1::timestamptz)", [t2]);
const after = (await sv("select amount_cents a, due_date::text d from platform_charges where house_id=$1 and kind='plan' and idempotency_key like 'plan:%' order by due_date", [HA])).rows;
const post = after.filter((x) => x.d >= EFF);
ok("renovação com vencimento na vigência ou depois sai com o valor novo", post.length >= 1 && post.every((x) => Number(x.a) === OLD + 3000), JSON.stringify(after));
ok("as faturas antigas já emitidas não mudam de valor", after.filter((x) => x.d < EFF).every((x) => Number(x.a) === OLD));

// ---------- 5) na vigência a tabela recebe o valor novo ----------
r = await sv("select public.platform_price_apply_due($1::timestamptz) n", [new Date(Date.parse(EFF + "T12:00:00-03:00") - 864e5).toISOString()]); ok("antes da vigência nada é aplicado", r.rows[0].n === 0);
ok("(tabela ainda no valor antigo)", Math.round(Number((await sv("select value->'plans'->'intermediario'->>'monthly' v from platform_settings where key='pricing'")).rows[0].v) * 100) === OLD);
r = await sv("select public.platform_price_apply_due($1::timestamptz) n", [new Date(Date.parse(EFF + "T12:00:00-03:00")).toISOString()]); ok("na vigência o reajuste é aplicado", !r.err && r.rows[0].n === 1, r.err);
ok("a tabela de preços passa a ter o valor novo", Math.round(Number((await sv("select value->'plans'->'intermediario'->>'monthly' v from platform_settings where key='pricing'")).rows[0].v) * 100) === OLD + 3000);
ok("o reajuste fica 'aplicado' e o evento registrado", (await sv("select status from platform_price_changes where id=$1", [A1.id])).rows[0].status === "aplicado" && Number((await sv("select count(*) n from platform_billing_events where kind='preco_aplicado'")).rows[0].n) === 1);
r = await sv("select public.platform_price_apply_due($1::timestamptz) n", [new Date(Date.parse(EFF + "T12:00:00-03:00") + 864e5).toISOString()]); ok("aplicar de novo não faz nada", r.rows[0].n === 0);
ok("o valor para qualquer data segue o novo", (await centsNow("intermediario", today)) === OLD + 3000);
r = await sv("update platform_price_changes set status='anunciado' where id=$1", [A1.id]); ok("reajuste aplicado não volta atrás", !!r.err, r.err);

// ---------- 6) aumento direto na tabela é recusado ----------
r = await sv("update platform_settings set value = jsonb_set(value, '{plans,maximo,monthly}', '9999'::jsonb) where key='pricing'"); ok("aumento direto na tabela é recusado com a cobrança ligada", !!r.err && /reajuste anunciado/.test(r.err), r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_set_setting('pricing', jsonb_set((select value from platform_settings where key='pricing'), '{plans,maximo,monthly}', '9999'::jsonb))")); ok("e também pelo painel do administrador", !!r.err && /reajuste anunciado/.test(r.err), r.err);
r = await sv("update platform_settings set value = jsonb_set(value, '{plans,maximo,monthly}', '10'::jsonb) where key='pricing'"); ok("redução vale na hora", !r.err, r.err);
r = await sv("update platform_settings set value = jsonb_set(value, '{boost_per_day,cidade}', '99'::jsonb) where key='pricing'"); ok("outros campos da tabela (ex.: impulsionamento) seguem livres", !r.err, r.err);
await sv("update platform_settings set value = jsonb_set(value, '{enabled}', 'false') where key='billing_config'");
r = await sv("update platform_settings set value = jsonb_set(value, '{plans,maximo,monthly}', '299.9'::jsonb) where key='pricing'"); ok("com a cobrança desligada o ajuste é livre (fase de preparação)", !r.err, r.err);
await sv("update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'");

// ---------- 7) cancelar um reajuste anunciado ----------
r = await annAs(ADM, "maximo", 600, await plus(35), "reajuste do premium"); const A2 = r.rows?.[0]?.r; ok("novo anúncio no Premium avisa a casa C", !r.err && A2.notified === 1, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.admin_price_cancel($1,'motivo de teste ok')", [A2.id])); ok("a casa não cancela reajuste", !!r.err, r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_price_cancel($1,'curto')", [A2.id])); ok("cancelar exige motivo", !!r.err && /motivo/.test(r.err), r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_price_cancel($1,'Decidimos manter o preço do Premium') n", [A2.id])); ok("o administrador cancela e as casas são avisadas", !r.err && r.rows[0].n === 1 && (await nNotes(CLI, "Atualização da tabela comercial cancelada:%")) === 1, r.err);
ok("reajuste cancelado não muda mais o valor", (await centsNow("maximo", await plus(200))) === Math.round(299.9 * 100));
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_price_cancel($1,'Cancelando de novo sem necessidade')", [A2.id])); ok("cancelar duas vezes: erro claro", !!r.err && /não está mais anunciado/.test(r.err), r.err);

// ---------- 8) leitura e permissões ----------
r = await as("authenticated", ADM, (cc) => q(cc, "select count(*) n from platform_price_changes")); ok("o administrador lê os reajustes", Number(r.rows?.[0]?.n) === 2, JSON.stringify(r));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from platform_price_changes")); ok("a casa não lê a tabela de reajustes (só recebe o aviso)", Number(r.rows?.[0]?.n) === 0 || !!r.err, JSON.stringify(r));
r = await as("anon", null, (cc) => q(cc, "select count(*) from platform_price_changes")); ok("visitante não lê", !!r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "insert into platform_price_changes(plan,old_cents,new_cents,announced_on,effective_on) values ('base',1000,2000,current_date,current_date+30)")); ok("nem o administrador escreve direto na tabela", !!r.err, r.err);
for (const sig of ["platform_price_changes_guard()", "platform_pricing_increase_guard()", "platform_price_apply_due(timestamptz)", "platform_plan_monthly_cents(text,date)"]) {
  ok(`${sig}: visitante e logado não executam`, !(await hasFn("anon", `public.${sig}`)) && !(await hasFn("authenticated", `public.${sig}`)));
}
ok("a rotina e o servidor executam apply_due e o valor por data", (await hasFn("service_role", "public.platform_price_apply_due(timestamptz)")) && (await hasFn("service_role", "public.platform_plan_monthly_cents(text,date)")));
ok("admin_price_announce / admin_price_cancel: logado e servidor executam, visitante não", !(await hasFn("anon", "public.admin_price_announce(text,numeric,date,text)")) && (await hasFn("authenticated", "public.admin_price_announce(text,numeric,date,text)")) && !(await hasFn("anon", "public.admin_price_cancel(uuid,text)")) && (await hasFn("authenticated", "public.admin_price_cancel(uuid,text)")));
ok("a rotina diária de aplicação está agendada na migration (no banco de teste o agendador é simulado)", /cron\.schedule\('platform-price-apply', '10 \* \* \* \*'/.test(readFileSync(new URL("../migrations/0100_reajuste_tabela_comercial.sql", import.meta.url), "utf8")));
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
