// Verificação LOCAL das migrations 0110–0111 (plano Grátis, limites, volta ao Grátis, Essencial contratável, assistente com pacote).
// Uso: node supabase/verify/verify_0111.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"], ["0108_contratacao_de_plano_no_app.sql", "-- ============ 8) permissões ============"]];
const name = "vf0111";
const { c: su, failed } = await freshDb(name, { with64: true, max: 111 });
ok("migrations 0001–0111 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
await su.query(part("0111_plano_gratis.sql", "-- ============ 7) permissões: só o servidor chama as funções internas ============"));
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err); return r; };
const PR = (await sv("select value from platform_settings where key='pricing'")).rows[0].value.plans;
const cents = (p) => Math.round(Number(PR[p].monthly) * 100);

let seq = 0;
async function mk(tag, plan, { billing = null, startedAgo = 40, payAcct = false } = {}) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0111000-0000-0000-0000-00000000${hex}`, H = `d0111000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-$3::int,true)", [H, billing, startedAgo]);
  if (payAcct) await sv("insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_'||$3,'ativa',true,true)", [H, O, String(i)]);
  return { O, H };
}
let n = 0;
const pay = async (id, amount) => {
  const ref = `cs_0111_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amount]);
  if (r.err) throw new Error(r.err);
};
const oldPaid = async (H, plan) => {
  const id = (await sv("select public.platform_charge_issue($1,'plan',$2,$3::bigint,current_date-40,current_date-40,'teste',$4) id", [H, "plan:" + plan, cents(plan), `v0111-old-${++n}`])).rows[0].id;
  await pay(id, cents(plan));
  await force("update platform_charges set paid_at = now() - interval '40 days', created_at = now() - interval '40 days' where id=$1", [id]);
  return id;
};
const svcSql = "insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho',$2,'Descrição longa o suficiente para o serviço ser válido e aceito.',10000,$3,'transmissao',false,60) returning id";

// ---- A) estrutura
ok("A: o tipo house_plan tem gratis antes de base", (await sv("select array_agg(e.enumlabel::text order by e.enumsortorder) l from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='house_plan'")).rows[0].l.join() === "gratis,base,intermediario,maximo");
ok("A: ordem dos planos (rank)", (await sv("select array_agg(public.platform_plan_rank(p) order by public.platform_plan_rank(p)) r from unnest(array['gratis','base','intermediario','maximo']) p")).rows[0].r.join() === "0,1,2,3");
ok("A: rank de plano desconhecido é nulo", (await sv("select public.platform_plan_rank('x') r")).rows[0].r === null);
const M = (await sv("select public.plan_matrix() m")).rows[0].m;
ok("A: matriz válida com 4 planos e 16 chaves", (await sv("select public.plan_matrix_ok(public.plan_matrix_default()) ok")).rows[0].ok && Object.keys(M.caps).sort().join() === "base,gratis,intermediario,maximo" && Object.values(M.caps).every((x) => Object.keys(x).length === 16));
ok("A: assistente 0 / 100 / 500 / 1700", [0, 100, 500, 1700].every((v, i) => M.caps[["gratis", "base", "intermediario", "maximo"][i]].assistant_replies === v));
ok("A: limites do Grátis 3 / 2 / 8 e os pagos sem limite (0)", M.caps.gratis.limit_services === 3 && M.caps.gratis.limit_rituals === 2 && M.caps.gratis.limit_posts_month === 8 && ["base", "intermediario", "maximo"].every((p) => M.caps[p].limit_services === 0 && M.caps[p].limit_rituals === 0 && M.caps[p].limit_posts_month === 0));
const bad1 = JSON.parse(JSON.stringify(M)); delete bad1.caps.gratis;
const bad2 = JSON.parse(JSON.stringify(M)); bad2.caps.base.limit_services = 1001;
const bad3 = JSON.parse(JSON.stringify(M)); delete bad3.caps.base.limit_posts_month; bad3.caps.base.extra = 1;
ok("A: matriz sem o Grátis, com limite fora da faixa ou com chave faltando é recusada", !(await sv("select public.plan_matrix_ok($1::jsonb) ok", [JSON.stringify(bad1)])).rows[0].ok && !(await sv("select public.plan_matrix_ok($1::jsonb) ok", [JSON.stringify(bad2)])).rows[0].ok && !(await sv("select public.plan_matrix_ok($1::jsonb) ok", [JSON.stringify(bad3)])).rows[0].ok);
ok("A: a matriz salva no painel foi trocada pela nova", JSON.stringify((await sv("select value v from platform_settings where key='plan_matrix'")).rows[0].v) === JSON.stringify(M));

// ---- B) casa nova nasce no Grátis; dono não escolhe o plano
const N = await as("b0111000-0000-0000-0000-00000000ffff", async () => null).catch(() => null);
const NO = "b0111000-0000-0000-0000-00000000f001";
await su.query("insert into auth.users(id,email) values ($1,'novo@x.com')", [NO]);
await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [NO]);
const ins = await as(NO, (c) => q(c, "insert into houses(owner_id,name,slug,plan) values ($1,'Casa Nova','casa-nova-x','maximo') returning plan::text p", [NO]));
ok("B: a casa criada pela dona nasce no Grátis, mesmo pedindo outro plano", !ins.err && ins.rows[0].p === "gratis", ins.err);
const noPlan = await as(NO, (c) => q(c, "update houses set plan='maximo' where owner_id=$1", [NO]));
ok("B: a dona não consegue mudar o próprio plano", (await sv("select plan::text p from houses where owner_id=$1", [NO])).rows[0].p === "gratis");

// ---- C) conversão das casas existentes (roda o bloco da migration sobre um estado antigo)
{
  const { c: s2 } = await freshDb("vf0111b", { with64: true, max: 110 });
  const mkOld = async (i, plan, active, revert) => {
    const O = `b0111b00-0000-0000-0000-0000000000${i}`, H = `d0111b00-0000-0000-0000-0000000000${i}`;
    await s2.query("insert into auth.users(id,email) values ($1,$2)", [O, `o${i}@x.com`]);
    await s2.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
    await s2.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, "C" + i, "c-" + i, plan]);
    if (active !== null) await s2.query("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date-40,$2)", [H, active]);
    if (revert) await s2.query("update houses set plan_revert_to=$2, plan_revert_at=now()+interval '5 days' where id=$1", [H, revert]);
    return H;
  };
  const h1 = await mkOld("11", "base", null), h2 = await mkOld("12", "base", true), h3 = await mkOld("13", "maximo", null), h4 = await mkOld("14", "intermediario", true, "base"), h5 = await mkOld("15", "base", false);
  await s2.query(readFileSync(new URL("../migrations/0111_plano_gratis.sql", import.meta.url), "utf8"));
  const pl = async (h) => (await s2.query("select plan::text p, plan_revert_to::text r from houses where id=$1", [h])).rows[0];
  ok("C: base sem assinatura ativa vira gratis", (await pl(h1)).p === "gratis");
  ok("C: base COM assinatura ativa continua base (Essencial pago)", (await pl(h2)).p === "base");
  ok("C: plano dado pelo suporte (maximo, sem cobrança) não muda", (await pl(h3)).p === "maximo");
  ok("C: retorno agendado para base passa a ser para gratis", (await pl(h4)).r === "gratis" && (await pl(h4)).p === "intermediario");
  ok("C: base com assinatura já encerrada vira gratis", (await pl(h5)).p === "gratis");
  await s2.end();
}

// ---- D) contratar o Essencial
const D = await mk("d", "gratis");
let r = await sv("select public.platform_subscribe_issue($1,'base') id", [D.H]);
ok("D: casa no Grátis emite a assinatura do Essencial", !r.err && !!r.rows[0].id, r.err);
const idD = r.rows[0].id;
const chD = (await sv("select amount_cents, item_key, kind from platform_charges where id=$1", [idD])).rows[0];
ok("D: valor = mensalidade cheia do Essencial", Number(chD.amount_cents) === cents("base") && chD.item_key === "plan:base" && chD.kind === "plan", JSON.stringify(chD));
r = await sv("select public.platform_subscribe_issue($1,'gratis')", [D.H]);
ok("D: não existe assinatura do plano Grátis", !!r.err && /plano com mensalidade/.test(r.err), r.err);
await pay(idD, cents("base"));
const hD = (await sv("select h.plan::text p, b.active from houses h join house_billing_plan b on b.house_id=h.id where h.id=$1", [D.H])).rows[0];
ok("D: pago, a casa vira Essencial (base) com cobrança mensal ativa", hD.p === "base" && hD.active === true, JSON.stringify(hD));

// ---- E) upgrade e descida passam a funcionar com 4 planos
const E = await mk("e", "base", { billing: 5, startedAgo: 40 });
await oldPaid(E.H, "base");
const q1 = await sv("select public.platform_upgrade_quote($1,'intermediario',current_date) q", [E.H]);
ok("E: upgrade do Essencial para o Profissional tem valor proporcional", !q1.err && Number(q1.rows[0].q.amount_cents) > 0 && Number(q1.rows[0].q.new_cents) === cents("intermediario") && Number(q1.rows[0].q.old_cents) === cents("base"), q1.err || JSON.stringify(q1.rows[0]));
const st = await as(E.O, (c) => q(c, "select public.my_plan_change_status() s"));
ok("E: status mostra os upgrades Profissional e Premium para quem está no Essencial", !st.err && Object.keys(st.rows[0].s.upgrades).sort().join() === "intermediario,maximo", st.err || JSON.stringify(st.rows[0].s.upgrades));
const sc = await as(E.O, (c) => q(c, "select public.my_plan_change_schedule('gratis') s"));
ok("E: agenda a volta ao Grátis na renovação", !sc.err && !!sc.rows[0].s.effective_on, sc.err);
const sc2 = await as(E.O, (c) => q(c, "select public.my_plan_change_schedule('maximo') s"));
ok("E: não agenda 'descer' para um plano acima", !!sc2.err && /abaixo do atual/.test(sc2.err), sc2.err);
await as(E.O, (c) => q(c, "select public.my_plan_change_undo()"));
const sc3 = await as(E.O, (c) => q(c, "select public.my_plan_change_schedule('gratis') s"));
await force("update house_billing_plan set pending_plan_on = current_date where house_id=$1", [E.H]);
await sv("select public.platform_plan_pending_apply_due()");
const eAfter = (await sv("select h.plan::text p, b.active, b.pending_plan from houses h join house_billing_plan b on b.house_id=h.id where h.id=$1", [E.H])).rows[0];
ok("E: na renovação a casa volta ao Grátis, sem assinatura e sem troca pendente", eAfter.p === "gratis" && eAfter.active === false && eAfter.pending_plan === null, JSON.stringify(eAfter));
ok("E: e foi avisada", (await sv("select count(*)::int n from notifications where user_id=$1 and text like 'Sua casa voltou ao plano Grátis%'", [E.O])).rows[0].n === 1);
const E2 = await mk("e2", "maximo", { billing: 5, startedAgo: 40 });
await oldPaid(E2.H, "maximo");
await as(E2.O, (c) => q(c, "select public.my_plan_change_schedule('base')"));
await force("update house_billing_plan set pending_plan_on = current_date where house_id=$1", [E2.H]);
await sv("select public.platform_plan_pending_apply_due()");
const e2 = (await sv("select h.plan::text p, b.active from houses h join house_billing_plan b on b.house_id=h.id where h.id=$1", [E2.H])).rows[0];
ok("E: descer do Premium para o Essencial mantém a cobrança ativa", e2.p === "base" && e2.active === true, JSON.stringify(e2));

// ---- F) cancelar agora / no vencimento / reembolso: volta ao Grátis (não fica inativa)
const F = await mk("f", "intermediario", { billing: 5, startedAgo: 40 });
await oldPaid(F.H, "intermediario");
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,last4,auto_enabled,saved_on) values ($1,'stripe','cus_f','pm_f','4242',true,current_date-10)", [F.H]);
const openF = (await sv("select public.platform_charge_issue($1,'plan','plan:intermediario',$2::bigint,current_date+10,current_date+10,'futura',$3) id", [F.H, cents("intermediario"), "v0111-f-open"])).rows[0].id;
const cf = await as(F.O, (c) => q(c, "select public.my_cancel_subscription('agora') s"));
ok("F: cancelar agora é aceito", !cf.err, cf.err);
const fS = (await sv("select h.plan::text p, b.active, s.cancelled_at, s.cancel_at, s.total, s.suspended from houses h join house_billing_plan b on b.house_id=h.id left join house_billing_state s on s.house_id=h.id where h.id=$1", [F.H])).rows[0];
ok("F: a casa voltou ao Grátis, sem cobrança mensal, sem estado inativo nem bloqueio", fS.p === "gratis" && fS.active === false && fS.cancelled_at === null && !fS.total && !fS.suspended, JSON.stringify(fS));
ok("F: a fatura futura foi cancelada e o cartão automático desligado", (await sv("select status from platform_charges where id=$1", [openF])).rows[0].status === "cancelada" && (await sv("select auto_enabled from house_card_on_file where house_id=$1", [F.H])).rows[0].auto_enabled === false);
ok("F: o aviso fala em Grátis (não em inativa)", (await sv("select count(*)::int n from notifications where user_id=$1 and text like 'Assinatura cancelada. Sua casa voltou ao plano Grátis%'", [F.O])).rows[0].n === 1);
ok("F: a casa continua visível na rede (não está escondida)", (await sv("select public.house_is_hidden($1) h", [F.H])).rows[0].h === false);
ok("F: pode contratar de novo (assinatura)", !(await sv("select public.platform_subscribe_issue($1,'intermediario') id", [F.H])).err);
// cancelamento agendado
const G = await mk("g", "maximo", { billing: 5, startedAgo: 40 });
await oldPaid(G.H, "maximo");
const cg = await as(G.O, (c) => q(c, "select public.my_cancel_subscription('vencimento') s"));
ok("G: cancelar no vencimento agenda e o aviso diz que volta ao Grátis", !cg.err && (await sv("select count(*)::int n from notifications where user_id=$1 and text like '%volta ao plano Grátis%'", [G.O])).rows[0].n === 1, cg.err);
await force("update house_billing_state set cancel_at = current_date where house_id=$1", [G.H]);
await sv("select public.platform_cancel_apply_due()");
const gS = (await sv("select h.plan::text p, b.active, s.cancelled_at, s.cancel_at from houses h join house_billing_plan b on b.house_id=h.id left join house_billing_state s on s.house_id=h.id where h.id=$1", [G.H])).rows[0];
ok("G: no dia agendado a casa volta ao Grátis", gS.p === "gratis" && gS.active === false && gS.cancelled_at === null && gS.cancel_at === null, JSON.stringify(gS));
// cancelar com dívida: o dinheiro devido continua sendo cobrado e a casa segue o fluxo de atraso
const Hd = await mk("h", "intermediario", { billing: 5, startedAgo: 80 });
await oldPaid(Hd.H, "intermediario");
await force("insert into platform_charges(house_id,kind,item_key,amount_cents,status,due_date,period_start,idempotency_key,description) values ($1,'plan','plan:intermediario',$2,'vencida',current_date-60,current_date-60,'v0111-h-debt','atraso')", [Hd.H, cents("intermediario")]);
await sv("select public.platform_house_cancel_apply($1)", [Hd.H]);
const hd = (await sv("select h.plan::text p, (select count(*)::int from platform_charges where house_id=h.id and status='vencida') venc, (select suspended from house_billing_state where house_id=h.id) s from houses h where h.id=$1", [Hd.H])).rows[0];
ok("H: cancelar com fatura vencida: volta ao Grátis, a dívida continua exigível e a suspensão por atraso se mantém", hd.p === "gratis" && hd.venc === 1 && hd.s === true, JSON.stringify(hd));

// ---- I) reembolso dos 7 dias: conclusão devolve ao Grátis
const I = await mk("i", "gratis");
const idI = (await sv("select public.platform_subscribe_issue($1,'intermediario') id", [I.H])).rows[0].id;
await pay(idI, cents("intermediario"));
const rf = await sv("select public.platform_plan_refund_begin($1,$2,$3) r", [I.H, idI, I.O]);
ok("I: casa recém-assinante abre o pedido de reembolso", !rf.err, rf.err);
const rid = rf.rows?.[0]?.r?.refund_id;
let done = null; if (rid) done = await sv("select public.platform_plan_refund_done($1,'re_test')", [rid]);
const iS = (await sv("select h.plan::text p, b.active, s.cancelled_at from houses h join house_billing_plan b on b.house_id=h.id left join house_billing_state s on s.house_id=h.id where h.id=$1", [I.H])).rows[0];
ok("I: concluído o estorno, a casa volta ao Grátis (não inativa) e a cobrança mensal parou", !done?.err && iS.p === "gratis" && iS.active === false && iS.cancelled_at === null, done?.err || JSON.stringify(iS));
ok("I: repetir a conclusão não faz nada de novo", (await sv("select public.platform_plan_refund_done($1,'re_test') r", [rid])).rows[0].r.already === true);
ok("I: aviso do reembolso fala em Grátis", (await sv("select count(*)::int n from notifications where user_id=$1 and text like '%voltou ao plano Grátis%'", [I.O])).rows[0].n >= 1);

// ---- J) limites do Grátis e conta de pagamento
const J = await mk("j", "gratis");
const sJ = (title, active = true) => as(J.O, (c) => q(c, svcSql, [J.H, title, active]));
let j1 = await sJ("S1");
ok("J: Grátis sem conta de pagamento NÃO publica serviço com preço", !!j1.err && /conecte primeiro a sua conta de recebimento/.test(j1.err), j1.err);
ok("J: pode guardar o serviço como rascunho (inativo)", !(await sJ("Rascunho", false)).err);
await sv("insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_j','ativa',false,false)", [J.H, J.O]);
j1 = await sJ("S1b");
ok("J: conta de pagamento ainda sem cobrança liberada também não basta", !!j1.err && /conta de recebimento/.test(j1.err), j1.err);
await sv("update house_payment_accounts set charges_enabled = true, payouts_enabled = true where house_id=$1", [J.H]);
const created = [];
for (const t of ["S1", "S2", "S3"]) { const x = await sJ(t); created.push(x.err ? x.err : "ok"); }
ok("J: com a conta liberada, publica até 3 serviços", created.every((x) => x === "ok"), created.join(","));
const j4 = await sJ("S4");
ok("J: o 4º serviço ativo é recusado com mensagem do limite", !!j4.err && /limite de 3 serviços/.test(j4.err), j4.err);
const sid = (await sv("select id from services where house_id=$1 and title='S1'", [J.H])).rows[0].id;
await as(J.O, (c) => q(c, "update services set active=false where id=$1", [sid]));
ok("J: desativar um serviço libera uma vaga", !(await sJ("S4")).err);
const re = await as(J.O, (c) => q(c, "update services set active=true where id=$1", [sid]));
ok("J: reativar acima do limite também é recusado", !!re.err && /limite de 3/.test(re.err), re.err);
const edit = await as(J.O, (c) => q(c, "update services set title='S2 editado' where house_id=$1 and title='S2'", [J.H]));
ok("J: editar um serviço já ativo continua permitido", !edit.err);
const evSql = "insert into events(house_id,title,description,price_cents,seats_total,duration_min,starts_at,status) values ($1,$2,'Ritual de teste com descrição longa o suficiente.',5000,10,60,now()+interval '10 days',$3) returning id";
const ev = (t, s = "publicado") => as(J.O, (c) => q(c, evSql, [J.H, t, s]));
ok("J: publica até 2 rituais", !(await ev("R1")).err && !(await ev("R2")).err);
const e3 = await ev("R3");
ok("J: o 3º ritual publicado é recusado", !!e3.err && /limite de 2 rituais/.test(e3.err), e3.err);
ok("J: rascunho de ritual não conta e não é barrado", !(await ev("R3 rascunho", "rascunho")).err);
const P = (t) => as(J.O, (c) => q(c, "insert into posts(house_id,content) values ($1,$2)", [J.H, t]));
const pr = []; for (let i = 1; i <= 8; i++) pr.push((await P("post " + i)).err ?? "ok");
ok("J: publica 8 posts no mês", pr.every((x) => x === "ok"), pr.join(","));
const p9 = await P("post 9");
ok("J: o 9º post do mês é recusado", !!p9.err && /limite de 8 publicações/.test(p9.err), p9.err);
await force("update posts set created_at = now() - interval '40 days' where house_id=$1 and content in ('post 1','post 2')", [J.H]);
ok("J: posts do mês passado não contam", !(await P("post 9")).err);
// casa paga: sem limite, sem trava da conta de pagamento
const K = await mk("k", "base", { billing: 5 });
const kr = []; for (let i = 1; i <= 5; i++) kr.push((await as(K.O, (c) => q(c, svcSql, [K.H, "K" + i, true]))).err ?? "ok");
ok("K: Essencial publica mais de 3 serviços e sem conta de pagamento (pode vender combinando direto)", kr.every((x) => x === "ok"), kr.join(","));
const kp = []; for (let i = 1; i <= 10; i++) kp.push((await as(K.O, (c) => q(c, "insert into posts(house_id,content) values ($1,$2)", [K.H, "p" + i]))).err ?? "ok");
ok("K: Essencial publica sem limite mensal", kp.every((x) => x === "ok"));
// servidor (sem usuário) não é barrado: rotinas internas e SQL do suporte
ok("K: operações do servidor (sem usuário) não são barradas pelos limites", !(await sv(svcSql, [J.H, "Servidor", true])).err);
// admin muda o limite na matriz: vale na hora
const M2 = JSON.parse(JSON.stringify(M)); M2.caps.gratis.limit_services = 1;
await sv("update platform_settings set value=$1::jsonb where key='plan_matrix'", [JSON.stringify(M2)]);
const L = await mk("l", "gratis", { payAcct: true });
const l1 = await as(L.O, (c) => q(c, svcSql, [L.H, "L1", true])); const l2 = await as(L.O, (c) => q(c, svcSql, [L.H, "L2", true]));
ok("L: o limite editado no painel vale na hora (1 serviço)", !l1.err && !!l2.err && /limite de 1 serviços/.test(l2.err), l2.err);
await sv("update platform_settings set value=$1::jsonb where key='plan_matrix'", [JSON.stringify(M)]);

// ---- M) assistente no Grátis: só com pacote
const Mh = await mk("m", "gratis");
await sv("insert into assistants(house_id, enabled, display_name) values ($1,true,'Lara') on conflict (house_id) do update set enabled=true, display_name='Lara'", [Mh.H]);
ok("M: sem pacote, a assistente do Grátis não aparece para o cliente", (await sv("select public.assistant_display_name($1) n", [Mh.O])).rows[0].n === null);
const idc = (await sv("select public.platform_credit_purchase($1,'p80') id", [Mh.H]));
ok("M: casa no Grátis consegue pedir um pacote de respostas", !idc.err && !!idc.rows[0].id, idc.err);
await pay(idc.rows[0].id, 1990);
ok("M: pago o pacote, o saldo é de 80 respostas", (await sv("select public.ai_credit_balance($1) b", [Mh.H])).rows[0].b === 80);
ok("M: com pacote, a assistente aparece", (await sv("select public.assistant_display_name($1) n", [Mh.O])).rows[0].n === "Lara");
const ru = await sv("select public.assistant_record_usage($1,$2,'m',100,10) r", [Mh.H, Mh.O]);
ok("M: cada resposta no Grátis consome 1 do pacote", !ru.err && ru.rows[0].r.from_credit === true && ru.rows[0].r.credits_left === 79 && ru.rows[0].r.uncovered === false, ru.err || JSON.stringify(ru.rows[0]));
const cs = await as(Mh.O, (c) => q(c, "select public.my_ai_credit_status() s"));
ok("M: o status mostra pacotes à venda e o saldo para a casa do Grátis", !cs.err && cs.rows[0].s.for_sale === true && cs.rows[0].s.balance === 79 && cs.rows[0].s.limit === 0, cs.err || JSON.stringify(cs.rows[0].s));
await force("update ai_credit_packs set remaining = 1 where house_id=$1", [Mh.H]);
await sv("select public.assistant_record_usage($1,$2,'m',100,10)", [Mh.H, Mh.O]);
ok("M: ao zerar o pacote, a dona é avisada", (await sv("select count(*)::int n from notifications where user_id=$1 and text like 'Seus créditos de respostas acabaram%'", [Mh.O])).rows[0].n === 1);
const unc = await sv("select public.assistant_record_usage($1,$2,'m',100,10) r", [Mh.H, Mh.O]);
ok("M: sem pacote, o uso fica 'não coberto' (o servidor já bloqueia antes)", unc.rows[0].r.uncovered === true && unc.rows[0].r.from_credit === false);
// Essencial: franquia de 100 e depois pacote
const Eh = await mk("n", "base", { billing: 5 });
await sv("insert into assistants(house_id, enabled, display_name) values ($1,true,'Ana') on conflict (house_id) do update set enabled=true", [Eh.H]);
ok("N: Essencial tem a assistente (limite mensal 100)", (await sv("select public.assistant_monthly_limit('base') l")).rows[0].l === 100 && (await sv("select public.assistant_display_name($1) n", [Eh.O])).rows[0].n === "Ana");
// permissões das funções internas
const anon = await as("b0111000-0000-0000-0000-00000000f001", (c) => q(c, "select public.platform_house_to_free($1)", [D.H]));
ok("O: usuário comum NÃO chama a função que devolve a casa ao Grátis", !!anon.err, anon.err);
const anon2 = await as("b0111000-0000-0000-0000-00000000f001", (c) => q(c, "select public.house_payment_ready($1)", [D.H]));
ok("O: usuário comum NÃO consulta a conta de pagamento de outra casa pela função interna", !!anon2.err, anon2.err);

console.log(`\n${total - bad}/${total} OK`);
await su.end();
process.exit(bad ? 1 : 0);
