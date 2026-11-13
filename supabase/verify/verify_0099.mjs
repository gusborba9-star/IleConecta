// Verificação LOCAL da migration 0099 (reativação da casa por pagamento).
// Uso: node supabase/verify/verify_0099.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0099", { with64: true, max: 99 });
ok("migrations 0001–0099 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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
const as = async (role, uid, fn) => { const c = await connect("vf0099"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
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

// matrícula, cartão e pagamento do primeiro plano (como na 0098), depois o reembolso que cancela a casa A
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const payCharge = async (id, amt) => { const ref = `cs_r_${++pn}`; await sv("select public.platform_charge_attach($1,'stripe',$2,'card',null)", [id, ref]); const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amt]); if (r.err) throw new Error(r.err); return ref; };
const state = async (h) => (await sv("select * from house_billing_state where house_id=$1", [h])).rows[0];
const enroll = async (h) => (await sv("select * from house_billing_plan where house_id=$1", [h])).rows[0];
const nNotes = async (u, like) => Number((await sv("select count(*) n from notifications where user_id=$1 and text like $2", [u, like])).rows[0].n);
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
const issueRe = (h, now = null) => sv("select public.platform_reactivation_issue($1, coalesce($2::timestamptz, now())) id", [h, now]);

const MONTHLY = (await sv("select value->'plans'->'intermediario'->>'monthly' v from platform_settings where key='pricing'")).rows[0].v;
const PRICE = Math.round(Number(MONTHLY) * 100);
for (const h of [HA, HB]) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,'2026-10-10',true)", [h]);
await sv("select public.platform_card_customer($1,'stripe','cus_A')", [HA]);
await sv("insert into house_card_setups(ref,house_id,provider) values ('seti_A',$1,'stripe')", [HA]);
await sv("select public.platform_card_save($1,'stripe','seti_A','cus_A','pm_A','visa','4242',12,2030)", [HA]);

// ---------- 1) casa ativa não reativa ----------
let r = await issueRe(HA); ok("casa que não foi cancelada não emite fatura de reativação", !!r.err && /não está cancelada/.test(r.err), r.err);

// cancela a casa A pelo reembolso (fluxo da 0098)
const P1 = await issue(HA, "2026-11-10", "primeiro-plano-casa-A-1", "plan", "plan:intermediario", PRICE);
await payCharge(P1, PRICE);
const b = (await sv("select public.platform_plan_refund_begin($1,$2,null,now()) r", [HA, P1])).rows[0].r;
await sv("select public.platform_plan_refund_done($1,'re_1')", [b.refund_id]);
ok("(base) a casa A está cancelada, inativa, sem cartão automático", (await level(HA)) === "total" && (await enroll(HA)).active === false && !!(await state(HA)).cancelled_at);
const notesBefore = await nNotes(OWN_A, "%");

// ---------- 2) emitir a fatura de reativação ----------
r = await issueRe(HA); const R1 = r.rows?.[0]?.id; ok("emite a fatura de reativação", !r.err && !!R1, r.err);
let ch = (await sv("select * from platform_charges where id=$1", [R1])).rows[0];
ok("é fatura de plano, pelo plano atual da casa, com o valor da tabela (valor da tabela), vence hoje", ch.kind === "plan" && ch.item_key === "plan:intermediario" && Number(ch.amount_cents) === PRICE && ch.status === "aberta" && ch.description === "Reativação do plano", JSON.stringify(ch));
r = await issueRe(HA); ok("pedir de novo reaproveita a fatura aberta (não duplica)", !r.err && r.rows[0].id === R1 && Number((await sv("select count(*) n from platform_charges where idempotency_key like 'reativacao:%' and house_id=$1", [HA])).rows[0].n) === 1, r.err);
ok("fica registrado que a casa pediu a reativação", Number((await sv("select count(*) n from platform_billing_events where kind='reativacao_solicitada' and charge_id=$1", [R1])).rows[0].n) === 1);
ok("a fatura de reativação não dispara lembrete de cobrança", (await nNotes(OWN_A, "%")) === notesBefore && Number((await sv("select count(*) n from platform_billing_notices where charge_id=$1", [R1])).rows[0].n) === 0);
await sv("select public.platform_billing_tick($1::timestamptz)", [new Date(Date.now() + 2 * 864e5).toISOString()]);
ok("a rotina diária também não manda lembrete dessa fatura", Number((await sv("select count(*) n from platform_billing_notices where charge_id=$1", [R1])).rows[0].n) === 0);
await sv("update house_card_on_file set auto_enabled = true where house_id=$1", [HA]);
ok("(controle) a cobrança automática de cartão está disponível neste teste", (await sv("select public.billing_auto_card_enabled() e")).rows[0].e === true);
ok("(blindagem) com cartão automático ligado, a fatura de reativação aberta NÃO entra na cobrança automática", (await sv("select * from public.platform_autocharge_due(now() + interval '3 days')")).rows.every((x) => x.charge_id !== R1));
await sv("update house_card_on_file set auto_enabled = false where house_id=$1", [HA]);
ok("enquanto não paga, a casa continua inativa", (await level(HA)) === "total" && (await enroll(HA)).active === false);
await sv("update platform_settings set value = jsonb_set(value, '{plans,intermediario,monthly}', 'null'::jsonb) where key='pricing'");
r = await issueRe(HB); ok("(HB não cancelada) sem fatura", !!r.err);
await sv("update platform_settings set value = jsonb_set(value, '{plans,intermediario,monthly}', $1::jsonb) where key='pricing'", [MONTHLY]);

// ---------- 3) pagar reativa ----------
await payCharge(R1, PRICE);
const st = await state(HA), en = await enroll(HA);
const day = Number((await sv("select extract(day from (now() at time zone 'America/Sao_Paulo'))::int d")).rows[0].d);
ok("pago: a casa volta ao nível normal", (await level(HA)) === "ok" && st.cancelled_at === null && st.total === false && st.suspended === false, JSON.stringify(st));
ok("pago: matriculada de novo, vencendo no dia do pagamento (máx. 28)", en.active === true && en.billing_day === Math.min(day, 28), JSON.stringify(en));
ok("a cobrança automática continua desligada (a casa liga se quiser)", (await sv("select auto_enabled a from house_card_on_file where house_id=$1", [HA])).rows[0].a === false);
ok("aviso de reativação enviado uma vez e evento registrado", (await nNotes(OWN_A, "Pagamento confirmado: sua casa foi reativada%")) === 1 && Number((await sv("select count(*) n from platform_billing_events where kind='casa_reativada_pagamento' and charge_id=$1", [R1])).rows[0].n) === 1);
await sv("select public.platform_charge_confirm('stripe',(select provider_ref from platform_charges where id=$1),PRICE::bigint,59)", [R1]);
ok("confirmar de novo não duplica aviso nem evento", (await nNotes(OWN_A, "Pagamento confirmado: sua casa foi reativada%")) === 1 && Number((await sv("select count(*) n from platform_billing_events where kind='casa_reativada_pagamento'")).rows[0].n) === 1);
r = await sv("select public.platform_plan_refund_begin($1,$2,null,now()) r", [HA, R1]); ok("o pagamento da reativação NÃO dá novo reembolso de 7 dias", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_plan_refund() s")); ok("tela da casa: não está mais cancelada e não há oferta de reembolso", r.rows[0].s.cancelled === false && r.rows[0].s.eligible === false, JSON.stringify(r.rows?.[0]?.s));
r = await issueRe(HA); ok("casa já reativada não emite outra fatura de reativação", !!r.err && /não está cancelada/.test(r.err), r.err);
const before = Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan'", [HA])).rows[0].n);
await sv("select public.platform_billing_tick(now())");
ok("a rotina não gera mensalidade duplicada no mesmo período da reativação", Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan'", [HA])).rows[0].n) === before);
await sv("select public.platform_billing_tick($1::timestamptz)", [new Date(Date.now() + 35 * 864e5).toISOString()]);
ok("no mês seguinte a mensalidade volta a ser emitida normalmente", Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan' and idempotency_key like 'plan:%'", [HA])).rows[0].n) >= 1);

// ---------- 4) suporte reativa e encerra a fatura aberta ----------
const P2 = await issue(HB, "2026-09-03", "primeiro-plano-casa-B-1", "plan", "plan:intermediario", PRICE);
await payCharge(P2, PRICE);
const b2 = (await sv("select public.platform_plan_refund_begin($1,$2,null,now()) r", [HB, P2])).rows[0].r;
await sv("select public.platform_plan_refund_done($1,'re_2')", [b2.refund_id]);
const RB = (await issueRe(HB)).rows[0].id;
r = await as("authenticated", OWN_B, (cc) => q(cc, "select public.admin_billing_reactivate($1,'motivo de teste ok')", [HB])); ok("a própria casa não usa a reativação do suporte", !!r.err, r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_billing_reactivate($1,'Casa pediu para voltar, combinado com o suporte')", [HB])); ok("o suporte reativa mesmo com fatura de reativação aberta", !r.err, r.err);
ok("a fatura de reativação aberta é cancelada e a casa volta ao normal (sem ficar presa por fatura velha)", (await sv("select status from platform_charges where id=$1", [RB])).rows[0].status === "cancelada" && (await level(HB)) === "ok");
ok("auditoria do suporte registrada", Number((await sv("select count(*) n from admin_audit where key='billing_reactivate'")).rows[0].n) === 1);
await sv("select public.platform_charge_attach($1,'stripe','cs_late_RB','card',null)", [RB]).catch(() => {});
ok("fatura cancelada não pode mais ser paga", !!(await sv("select public.platform_charge_attach($1,'stripe','cs_late_RB','card',null)", [RB])).err);

// ---------- 5) permissões ----------
for (const sig of ["platform_reactivation_issue(uuid,timestamptz)", "platform_house_reactivated_by_payment()"]) {
  ok(`${sig}: visitante e logado não executam`, !(await hasFn("anon", `public.${sig}`)) && !(await hasFn("authenticated", `public.${sig}`)));
}
ok("platform_reactivation_issue: o servidor executa", await hasFn("service_role", "public.platform_reactivation_issue(uuid,timestamptz)"));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.platform_reactivation_issue($1)", [HA])); ok("a casa não emite a fatura direto pelo banco", !!r.err, r.err);
ok("admin_billing_reactivate: visitante não executa; logado e servidor sim", !(await hasFn("anon", "public.admin_billing_reactivate(uuid,text)")) && (await hasFn("authenticated", "public.admin_billing_reactivate(uuid,text)")) && (await hasFn("service_role", "public.admin_billing_reactivate(uuid,text)")));
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
