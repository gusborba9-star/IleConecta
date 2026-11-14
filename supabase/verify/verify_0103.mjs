// Verificação LOCAL da migration 0103 (cancelar com fatura vencida, reativar só quitando, aceite obrigatório da cobrança automática).
// Roda sobre a base com as migrations 0001–0103. Uso: node supabase/verify/verify_0103.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"]];
const DATA_FIX = readFileSync(new URL("../migrations/0103_cancelar_com_divida_e_aceite_cartoes.sql", import.meta.url), "utf8").split("-- ============ 4) cobrança automática só com aceite registrado ============")[1].split("-- defesa extra")[0].replace(/^[^\n]*\n[^\n]*\n/, "");

const name = "vf0103";
const { c: su, failed } = await freshDb(name, { with64: true, max: 103 });
ok("migrations 0001–0103 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);

let seq = 0;
async function mkHouse(tag) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0103000-0000-0000-0000-00000000${hex}`, H = `d0103000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `o${i}@x`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'maximo')", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`]);
  await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date-40,true)", [H]);
  return { O, H };
}
const issue = (H, key, amount, dueOffset, periodOffset) =>
  sv("select public.platform_charge_issue($1,'plan','plan:maximo',$2::bigint,current_date+$3::int,case when $4::int is null then null else current_date+$4::int end,'teste','v0103-' || $5) id", [H, amount, dueOffset, periodOffset, key]);
const status = async (id) => (await sv("select status from platform_charges where id=$1", [id])).rows[0].status;
let n = 0;
const payCharge = async (cid) => {
  const ref = `cs_0103_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [cid, ref]);
  const amt = (await sv("select amount_cents a from platform_charges where id=$1", [cid])).rows[0].a;
  return sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amt]);
};

// ---- A) cancelar agora com fatura vencida
const A = await mkHouse("a");
const _t = await issue(A.H, "ven-a-1", 29990, -5, -35); if (_t.err) { console.log("ISSUE ERR", _t.err); process.exit(2); }
const overdueA = _t.rows[0].id;
const futureA = (await issue(A.H, "fut-a-1", 29990, 5, -5 + 30)).rows[0].id;
let r = await as(A.O, (c) => q(c, "select public.my_cancel_status() s"));
ok("A: com fatura vencida a casa PODE cancelar", r.rows?.[0]?.s?.can_cancel === true, JSON.stringify(r.rows?.[0]?.s ?? r.err));
ok("A: o status informa a dívida (R$ 299,90)", Number(r.rows?.[0]?.s?.debt_cents) === 29990);
r = await as(A.O, (c) => q(c, "select public.my_cancel_subscription('agora') r"));
ok("A: cancelar agora funciona e devolve a dívida", !r.err && r.rows[0].r.mode === "agora" && Number(r.rows[0].r.debt_cents) === 29990, r.err);
ok("A: a fatura VENCIDA continua aberta (a dívida não some)", (await status(overdueA)) === "aberta");
ok("A: a fatura futura foi cancelada", (await status(futureA)) === "cancelada");
ok("A: a casa ficou inativa", (await sv("select active from house_billing_plan where house_id=$1", [A.H])).rows[0].active === false);
r = await as(A.O, (c) => q(c, "select public.my_account_gate() g"));
ok("A: a tela mostra 'inativa' com a dívida", r.rows?.[0]?.g?.state === "inativa" && Number(r.rows[0].g.debt_cents) === 29990, JSON.stringify(r.rows?.[0]?.g ?? r.err));
const nt = await sv("select text from notifications where user_id=$1 order by created_at desc limit 1", [A.O]);
ok("A: a notificação avisa que a fatura vencida segue em aberto", /fatura vencida de R\$ 299,90 continua em aberto/.test(nt.rows[0]?.text ?? ""), nt.rows[0]?.text);
r = await sv("select public.platform_reactivation_issue($1,'maximo') id", [A.H]);
ok("A: reativar com dívida é recusado, com o valor", !!r.err && /Pague a fatura vencida de R\$ 299,90 antes de reativar/.test(r.err), r.err);
ok("A: a fatura vencida segue pagável (aparece na tela de cobrança)", (await as(A.O, (c) => q(c, "select public.my_house_billing_status() s"))).rows?.[0]?.s?.charges?.length >= 1);
r = await payCharge(overdueA);
ok("A: pagar a fatura vencida funciona", !r.err, r.err);
ok("A: continua inativa depois de pagar a dívida (só reativa pagando o plano)", (await sv("select cancelled_at is not null c from house_billing_state where house_id=$1", [A.H])).rows[0].c === true);
r = await as(A.O, (c) => q(c, "select public.my_account_gate() g"));
ok("A: depois de quitar, a dívida some da tela", r.rows?.[0]?.g?.state === "inativa" && Number(r.rows[0].g.debt_cents) === 0, JSON.stringify(r.rows?.[0]?.g ?? r.err));
r = await sv("select public.platform_reactivation_issue($1,'maximo') id", [A.H]);
ok("A: quitada a dívida, a reativação é emitida", !r.err && typeof r.rows[0].id === "string", r.err);
r = await payCharge(r.rows[0].id);
ok("A: paga a reativação, a casa volta", !r.err && (await sv("select active from house_billing_plan where house_id=$1", [A.H])).rows[0].active === true && (await sv("select cancelled_at is null c from house_billing_state where house_id=$1", [A.H])).rows[0].c === true, r.err);

// ---- B) agendar (usar até o vencimento) com fatura vencida
const B = await mkHouse("b");
const overdueB = (await issue(B.H, "ven-b-1", 29990, -5, -35)).rows[0].id;
const futureB = (await issue(B.H, "fut-b-1", 29990, 5, -5 + 30)).rows[0].id;
r = await as(B.O, (c) => q(c, "select public.my_cancel_subscription('vencimento') r"));
ok("B: agendar com fatura vencida funciona", !r.err, r.err);
ok("B: a vencida continua aberta e a futura foi cancelada", (await status(overdueB)) === "aberta" && (await status(futureB)) === "cancelada");
r = await as(B.O, (c) => q(c, "select public.my_cancel_undo() r"));
ok("B: desfazer reemite só a fatura futura", !r.err && Number(r.rows[0].r.reissued) === 1 && (await status(overdueB)) === "aberta", r.err);

// ---- C) continua recusado: pagamento em processamento / reembolso do plano em andamento
const C = await mkHouse("c");
const procC = (await issue(C.H, "proc-c-1", 29990, 0, 0)).rows[0].id;
await sv("select public.platform_charge_attach($1,'stripe','cs_proc_c','card',null)", [procC]);
const pg_ = await sv("select public.platform_charge_progress('stripe','cs_proc_c','processing',now())"); if (pg_.err) console.log("PROGRESS ERR", pg_.err);
console.log("C status", await status(procC));
r = await as(C.O, (c) => q(c, "select public.my_cancel_subscription('agora') r"));
ok("C: com pagamento em processamento o cancelamento segue recusado", !!r.err && /processamento/.test(r.err), r.err);

// ---- D) cobrança automática só com aceite registrado
const D = await mkHouse("d");
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,brand,last4,exp_month,exp_year,auto_enabled,saved_on) values ($1,'stripe','cus_d','pm_d','visa','4242',12,2035,true,current_date-30)", [D.H]);
const chD = (await issue(D.H, "auto-d-1", 29990, -1, -1)).rows[0].id;
r = await sv("select count(*) n from public.platform_autocharge_due(now()) where charge_id=$1", [chD]);
ok("D: cartão sem aceite NÃO entra na cobrança automática (defesa na rotina)", !r.err && Number(r.rows[0].n) === 0, r.err);
await su.query(DATA_FIX);
r = await sv("select auto_enabled a from house_card_on_file where house_id=$1", [D.H]);
ok("D: a regra desliga a cobrança automática do cartão sem aceite", r.rows[0].a === false);
const nd = await sv("select text from notifications where user_id=$1 order by created_at desc limit 1", [D.O]);
ok("D: a casa é avisada para confirmar a autorização", /confirme a autorização em Planos/.test(nd.rows[0]?.text ?? ""), nd.rows[0]?.text);
await su.query(DATA_FIX);
ok("D: rodar a regra de novo não duplica o aviso", Number((await sv("select count(*) n from notifications where user_id=$1 and text like '%confirme a autorização%'", [D.O])).rows[0].n) === 1);

const E = await mkHouse("e");
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,brand,last4,exp_month,exp_year,auto_enabled,saved_on) values ($1,'stripe','cus_e','pm_e','visa','4242',12,2035,true,current_date-30)", [E.H]);
const chE = (await issue(E.H, "auto-e-1", 29990, -1, -1)).rows[0].id;
const au = await as(E.O, (c) => q(c, "select public.platform_card_authorize('v1','maximo',29990,'mensal','Autorizo a cobrança automática mensal do plano no cartão salvo.')")); if (au.err) console.log('AUTH ERR', au.err);
r = await sv("select count(*) n from public.platform_autocharge_due(now()) where charge_id=$1", [chE]);
ok("E: cartão COM aceite entra na cobrança automática", !r.err && Number(r.rows[0].n) === 1, r.err);
await su.query(DATA_FIX);
ok("E: a regra não mexe em quem tem aceite", (await sv("select auto_enabled a from house_card_on_file where house_id=$1", [E.H])).rows[0].a === true);

// ---- F) permissões e idempotência
ok("F: platform_house_overdue_cents não é chamável por usuário", (await as(A.O, (c) => q(c, "select public.platform_house_overdue_cents($1, current_date)", [A.H]))).err !== undefined);
ok("F: platform_reactivation_issue não é chamável por usuário", (await as(A.O, (c) => q(c, "select public.platform_reactivation_issue($1,'maximo')", [A.H]))).err !== undefined);
await su.end();
console.log(`\n${total - bad}/${total} verificações passaram`);
process.exit(bad ? 1 : 0);
