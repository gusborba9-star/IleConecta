// Verificação LOCAL da migration 0105 (exclusão de conta bloqueada por pendência financeira; cartão apagado ao anonimizar).
// Roda sobre a base com as migrations 0001–0105. Uso: node supabase/verify/verify_0105.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"]];
const name = "vf0105";
const { c: su, failed } = await freshDb(name, { with64: true, max: 105 });
ok("migrations 0001–0105 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);

let seq = 0;
async function mkHouse(tag, { plan = true } = {}) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0105000-0000-0000-0000-00000000${hex}`, H = `d0105000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `o${i}@x`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'maximo')", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`]);
  if (plan) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date-40,true)", [H]);
  return { O, H };
}
const issue = (H, key, amount, dueOffset, periodOffset) =>
  sv("select public.platform_charge_issue($1,'plan','plan:maximo',$2::bigint,((now() at time zone 'America/Sao_Paulo')::date)+$3::int,case when $4::int is null then null else current_date+$4::int end,'teste','v0105-' || $5) id", [H, amount, dueOffset, periodOffset, key]);
let n = 0;
const payCharge = async (cid) => {
  const ref = `cs_0105_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [cid, ref]);
  const amt = (await sv("select amount_cents a from platform_charges where id=$1", [cid])).rows[0].a;
  return sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amt]);
};
const blockers = async (O) => (await sv("select public.account_deletion_blockers($1) b", [O])).rows[0].b;
const request = (O) => as(O, (c) => q(c, "select public.request_account_deletion('EXCLUIR') id"));

// ---- A) assinatura ativa bloqueia
const A = await mkHouse("a");
let b = await blockers(A.O);
ok("A: assinatura ativa bloqueia a exclusão, com o motivo", b.length === 1 && /assinatura ativa/.test(b[0]), JSON.stringify(b));
let r = await request(A.O);
ok("A: o pedido de exclusão é recusado com o motivo", !!r.err && /assinatura ativa/.test(r.err), r.err);
r = await as(A.O, (c) => q(c, "select public.my_account_status() s"));
ok("A: a tela de conta lista o impedimento", r.rows?.[0]?.s?.impedimentos?.length === 1, JSON.stringify(r.rows?.[0]?.s ?? r.err));

// ---- B) cancelada com fatura vencida: bloqueia pela dívida; paga, libera
const overdue = (await issue(A.H, "ven-a-1", 29990, -5, -35)).rows[0].id;
r = await as(A.O, (c) => q(c, "select public.my_cancel_subscription('agora') r"));
ok("B: cancela a assinatura (a dívida fica)", !r.err, r.err);
b = await blockers(A.O);
ok("B: com a dívida, o motivo é a fatura vencida, com o valor", b.length === 1 && /fatura vencida da plataforma de R\$ 299,90/.test(b[0]), JSON.stringify(b));
r = await request(A.O);
ok("B: pedido recusado pela dívida", !!r.err && /fatura vencida/.test(r.err), r.err);
const before = Number((await sv("select count(*) n from platform_charges where house_id=$1", [A.H])).rows[0].n);
await blockers(A.O); await request(A.O);
ok("B: a trava não cria cobrança nova", Number((await sv("select count(*) n from platform_charges where house_id=$1", [A.H])).rows[0].n) === before);
r = await payCharge(overdue);
ok("B: pagar a fatura funciona", !r.err, r.err);
b = await blockers(A.O);
ok("B: quitada e cancelada, não há mais impedimento", b.length === 0, JSON.stringify(b));
r = await request(A.O);
ok("B: o pedido de exclusão é aceito", !r.err && typeof r.rows[0].id === "string", r.err);

// ---- C) pagamento em processamento
const C = await mkHouse("c", { plan: false });
const procC = (await issue(C.H, "proc-c-1", 29990, 0, 0)).rows[0].id;
await sv("select public.platform_charge_attach($1,'stripe','cs_proc_c','card',null)", [procC]);
await sv("select public.platform_charge_progress('stripe','cs_proc_c','processing',now())");
b = await blockers(C.O);
ok("C: pagamento em processamento bloqueia", b.some((x) => /processamento/.test(x)), JSON.stringify(b));

// ---- D) reembolso do plano em andamento
const D = await mkHouse("d", { plan: false });
const paidD = (await issue(D.H, "pago-d-1", 29990, 0, 0)).rows[0].id; await payCharge(paidD);
await sv("insert into platform_plan_refunds(charge_id,house_id,amount_cents,status) values ($1,$2,29990,'pendente')", [paidD, D.H]);
b = await blockers(D.O);
ok("D: reembolso do plano em andamento bloqueia", b.some((x) => /reembolso do plano/.test(x)), JSON.stringify(b));
await sv("update platform_plan_refunds set status='concluido', done_at=now() where house_id=$1", [D.H]);
ok("D: concluído o reembolso, libera", (await blockers(D.O)).length === 0);

// ---- E) fatura ainda não vencida NÃO bloqueia; sem casa também não; travas antigas continuam
const E = await mkHouse("e", { plan: false });
await issue(E.H, "fut-e-1", 29990, 5, 0);
ok("E: fatura em dia (não vencida) não bloqueia", (await blockers(E.O)).length === 0);
const F = `b0105000-0000-0000-0000-0000000fff01`;
await su.query("insert into auth.users(id,email) values ($1,'f@x')", [F]);
await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Pessoa','Salvador') on conflict (id) do update set account_type='cliente'", [F]);
ok("E: pessoa sem casa não tem trava financeira", (await blockers(F)).length === 0);
await su.query("insert into public.admins(user_id) values ($1)", [F]);
b = await blockers(F);
ok("E: a trava antiga (administrador) continua valendo", b.length === 1 && /administrador/i.test(b[0]), JSON.stringify(b));

// ---- F) anonimizar: cartão apagado do banco e enfileirado; autorização mantida
const G = await mkHouse("g", { plan: false });
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,brand,last4,exp_month,exp_year,auto_enabled,saved_on) values ($1,'stripe','cus_g','pm_g','visa','4242',12,2035,true,current_date-30)", [G.H]);
const cons = (await sv("insert into legal_consents(user_id,doc_key,doc_version) values ($1,'termos_casa','x') returning id", [G.O])).rows[0].id;
await sv("insert into house_auto_authorizations(house_id,user_id,consent_id,plan_key,amount_cents,period,text_shown) values ($1,$2,$3,'maximo',29990,'mensal','Autorizo a cobrança automática mensal no cartão salvo.')", [G.H, G.O, cons]);
r = await request(G.O);
ok("F: sem pendência o pedido nasce", !r.err, r.err);
await sv("update account_deletion_requests set execute_after = now() - interval '1 minute' where user_id=$1", [G.O]);
const due = await sv("select * from public.account_deletions_due()");
ok("F: a rotina enxerga o pedido vencido", due.rows.some((d) => d.user_id === G.O), due.err);
r = await sv("select public.anonymize_account_and_queue($1,$2) f", [G.O, due.rows.find((d) => d.user_id === G.O)?.request_id]);
ok("F: anonimizou", !r.err, r.err);
ok("F: o cartão guardado sumiu do banco", Number((await sv("select count(*) n from house_card_on_file where house_id=$1", [G.H])).rows[0].n) === 0);
const qd = (await sv("select kind, ref from provider_cleanup_pending order by kind")).rows;
ok("F: cartão e cliente entraram na fila do provedor", qd.length === 2 && qd.some((x) => x.kind === "payment_method" && x.ref === "pm_g") && qd.some((x) => x.kind === "customer" && x.ref === "cus_g"), JSON.stringify(qd));
ok("F: o registro de autorização é mantido (prova de consentimento)", Number((await sv("select count(*) n from house_auto_authorizations where house_id=$1", [G.H])).rows[0].n) === 1);
ok("F: a conta foi anonimizada", (await sv("select deleted_at is not null d from profiles where id=$1", [G.O])).rows[0].d === true);
const l = (await sv("select * from public.provider_cleanup_list(10)")).rows;
ok("F: a rotina lista a fila", l.length === 2);
await sv("select public.provider_cleanup_mark($1,false,'erro de rede')", [l[0].id]);
ok("F: falha mantém na fila e conta a tentativa", (await sv("select attempts a from provider_cleanup_pending where id=$1", [l[0].id])).rows[0].a === 1);
await sv("select public.provider_cleanup_mark($1,true)", [l[0].id]);
ok("F: sucesso tira da fila", Number((await sv("select count(*) n from provider_cleanup_pending")).rows[0].n) === 1);

// ---- G) pedido pendente + dívida nova antes dos 7 dias: a rotina recusa
const H2 = await mkHouse("h", { plan: false });
r = await request(H2.O); ok("G: pedido nasce sem pendência", !r.err, r.err);
await issue(H2.H, "ven-h-1", 29990, -5, -35);
await sv("update account_deletion_requests set execute_after = now() - interval '1 minute' where user_id=$1", [H2.O]);
const due2 = await sv("select * from public.account_deletions_due()");
ok("G: com dívida surgida, a rotina NÃO executa", !due2.rows.some((d) => d.user_id === H2.O), due2.err);
const st = (await sv("select status, decision_note from account_deletion_requests where user_id=$1", [H2.O])).rows[0];
ok("G: o pedido fica recusado com o motivo", st.status === "recusada" && /fatura vencida/.test(st.decision_note), JSON.stringify(st));
ok("G: a pessoa é avisada", (await sv("select count(*) n from notifications where user_id=$1 and text like 'Sua exclusão não foi feita%'", [H2.O])).rows[0].n > 0);

// ---- permissões
const acl = async (fn) => (await sv("select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u, has_function_privilege('service_role', $1, 'execute') s", [fn])).rows[0];
for (const fn of ["public.account_deletion_money_blockers(uuid)", "public.provider_cleanup_list(integer)", "public.provider_cleanup_mark(uuid,boolean,text)", "public.anonymize_account_and_queue(uuid,uuid)"]) {
  // o ambiente de teste concede tudo; reaplica as permissões da migration antes de conferir
}
await su.query(readFileSync(new URL("../migrations/0105_exclusao_conta_pendencias_financeiras.sql", import.meta.url), "utf8").split("-- ============ 4) permissões ============")[1]);
let allOk = true; const bad_ = [];
for (const fn of ["public.account_deletion_money_blockers(uuid)", "public.account_deletion_blockers(uuid)", "public.provider_cleanup_list(integer)", "public.provider_cleanup_mark(uuid,boolean,text)", "public.anonymize_account_and_queue(uuid,uuid)"]) {
  const a = await acl(fn); if (a.a || a.u || !a.s) { allOk = false; bad_.push(fn); }
}
ok("permissões: só o servidor executa as funções novas", allOk, bad_.join(","));
r = await as(A.O, (c) => q(c, "select * from provider_cleanup_pending"));
ok("permissões: a fila do provedor não é legível por usuário logado (a fila tem 1 item)", !!r.err || r.rows.length === 0, JSON.stringify(r.rows));

console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end();
process.exit(bad ? 1 : 0);
