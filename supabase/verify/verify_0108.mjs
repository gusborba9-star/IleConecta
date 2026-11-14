// Verificação LOCAL da migration 0108 (contratação de plano no app: assinar, upgrade proporcional, descer na renovação).
// Uso: node supabase/verify/verify_0108.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"], ["0108_contratacao_de_plano_no_app.sql", "-- ============ 8) permissões ============"]];
const name = "vf0108";
const { c: su, failed } = await freshDb(name, { with64: true, max: 108 });
ok("migrations 0001–0108 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);
// atualiza fatura ignorando as travas de imutabilidade (só para montar o cenário de teste)
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err); return r; };
const today = (await sv("select (now() at time zone 'America/Sao_Paulo')::date d")).rows[0].d;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const PR = (await sv("select value from platform_settings where key='pricing'")).rows[0].value.plans;
const cents = (p) => Math.round(Number(PR[p].monthly) * 100);

let seq = 0;
async function mk(tag, plan, { billing = null, startedAgo = 40 } = {}) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0108000-0000-0000-0000-00000000${hex}`, H = `d0108000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-$3::int,true)", [H, billing, startedAgo]);
  return { O, H };
}
let n = 0;
const pay = async (id, amount) => {
  const ref = `cs_0108_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amount]);
  if (r.err) throw new Error(r.err);
};
// primeiro pagamento antigo (fora da janela de 7 dias), para a casa poder trocar de plano
const oldPaid = async (H, plan) => {
  const id = (await sv("select public.platform_charge_issue($1,'plan',$2,$3::bigint,current_date-40,current_date-40,'teste',$4) id", [H, "plan:" + plan, cents(plan), `v0108-old-${++n}`])).rows[0].id;
  await pay(id, cents(plan));
  const up = await force("update platform_charges set paid_at = now() - interval '40 days', created_at = now() - interval '40 days' where id=$1", [id]); if (up.err) console.log("UPD ERR", up.err);
  return id;
};
const billingDayFor = (offset) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + offset); return Math.min(d.getUTCDate(), 28); };

// ---- A) primeira assinatura
const A = await mk("a", "base");
let r = await sv("select public.platform_subscribe_issue($1,'maximo') id", [A.H]);
ok("A: emite a fatura de assinatura", !r.err && !!r.rows[0].id, r.err);
const idA = r.rows[0].id;
let ch = (await sv("select * from platform_charges where id=$1", [idA])).rows[0];
ok("A: valor = mensalidade cheia, sem período, vence hoje, chave assinatura:", Number(ch.amount_cents) === cents("maximo") && ch.period_start === null && ch.idempotency_key.startsWith("assinatura:") && ch.kind === "plan" && ch.item_key === "plan:maximo", JSON.stringify(ch));
ok("A: repetir reaproveita a mesma fatura", (await sv("select public.platform_subscribe_issue($1,'maximo') id", [A.H])).rows[0].id === idA);
const idA2 = (await sv("select public.platform_subscribe_issue($1,'intermediario') id", [A.H])).rows[0].id;
ok("A: trocar o plano escolhido cancela a fatura anterior e emite outra", idA2 !== idA && (await sv("select status from platform_charges where id=$1", [idA])).rows[0].status === "cancelada");
ok("A: sem avisos de fatura e sem cobrança no cartão para a fatura de assinatura", (await sv("select count(*)::int n from platform_billing_notices where charge_id=$1", [idA2])).rows[0].n === 0);
r = await sv("select public.platform_subscribe_issue($1,'base')", [A.H]);
ok("A: plano Base não pode ser assinado", !!r.err && /plano com mensalidade/.test(r.err), r.err);
await pay(idA2, cents("intermediario"));
const hA = (await sv("select h.plan::text, p.active, p.billing_day, p.started_on from houses h join house_billing_plan p on p.house_id=h.id where h.id=$1", [A.H])).rows[0];
ok("A: pago, o plano muda e a casa é matriculada com vencimento no dia do pagamento", hA.plan === "intermediario" && hA.active === true && hA.billing_day === Math.min(new Date(today).getUTCDate(), 28) && iso(hA.started_on) === iso(today), JSON.stringify(hA));
ok("A: a casa recebeu a notificação", (await sv("select count(*)::int n from notifications where user_id=$1 and text like 'Pagamento confirmado: seu plano está ativo%'", [A.O])).rows[0].n === 1);
r = await sv("select public.platform_subscribe_issue($1,'maximo')", [A.H]);
ok("A: casa já assinante não assina de novo (usa a troca de plano)", !!r.err && /já tem assinatura ativa/.test(r.err), r.err);
const Z = await mk("z", "base");
await sv("insert into house_billing_state(house_id, cancelled_at) values ($1, now())", [Z.H]);
r = await sv("select public.platform_subscribe_issue($1,'maximo')", [Z.H]);
ok("A: casa cancelada é mandada para a reativação", !!r.err && /reativação/.test(r.err), r.err);

// ---- B) fatura de assinatura/upgrade esquecida: nunca vira atraso nem suspende
const B = await mk("b", "base");
const idB = (await sv("select public.platform_subscribe_issue($1,'maximo') id", [B.H])).rows[0].id;
await force("update platform_charges set due_date = current_date - 1, created_at = now() - interval '1 day' where id=$1", [idB]);
const tk0 = await sv("select public.platform_billing_tick()"); if (tk0.err) console.log("TICK ERR", tk0.err);
ok("B: um dia depois, a fatura continua aberta (não vira vencida)", (await sv("select status from platform_charges where id=$1", [idB])).rows[0].status === "aberta");
await force("update platform_charges set created_at = now() - interval '3 days' where id=$1", [idB]);
await sv("select public.platform_billing_tick()");
ok("B: depois de 2 dias, a fatura é cancelada", (await sv("select status from platform_charges where id=$1", [idB])).rows[0].status === "cancelada");
ok("B: a casa não foi suspensa", (await sv("select count(*)::int n from house_billing_state where house_id=$1 and (suspended or total)", [B.H])).rows[0].n === 0);
// cartão automático não puxa
const Bc = await mk("bc", "intermediario", { billing: billingDayFor(10) });
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,last4,auto_enabled,saved_on) values ($1,'stripe','cus_x','pm_x','4242',true,current_date-10)", [Bc.H]);
await oldPaid(Bc.H, "intermediario");
const idUp0 = (await sv("select public.platform_upgrade_issue($1,'maximo') id", [Bc.H]));
ok("B: fatura de upgrade emitida para teste do cartão", !idUp0.err, idUp0.err);
const due = await sv("select count(*)::int n from public.platform_autocharge_due(now() + interval '3 days') where house_id=$1", [Bc.H]);
ok("B: o cartão automático não cobra a fatura de upgrade", !due.err && due.rows[0].n === 0, due.err);

// ---- C) upgrade proporcional
const C = await mk("c", "intermediario", { billing: billingDayFor(10) });
await oldPaid(C.H, "intermediario");
const qt = await sv("select public.platform_upgrade_quote($1,'maximo',current_date) q", [C.H]);
ok("C: cotação do upgrade", !qt.err, qt.err);
const Q = qt.rows[0].q;
const cend = new Date(Q.cycle_end), t0 = new Date(today);
const prev = new Date(cend); prev.setUTCMonth(prev.getUTCMonth() - 1);
const dtot = Math.round((cend - prev) / 864e5), left = Math.round((cend - t0) / 864e5);
const expected = Math.round(((cents("maximo") - cents("intermediario")) * left) / dtot);
ok("C: valor = diferença × dias que faltam ÷ dias do ciclo (conferido por fora)", Number(Q.amount_cents) === expected && Q.days_left === left && Q.days_total === dtot, `${JSON.stringify(Q)} esperado ${expected}`);
ok("C: o vencimento do ciclo não muda (dia de cobrança)", new Date(Q.cycle_end).getUTCDate() === billingDayFor(10));
r = await sv("select public.platform_upgrade_quote($1,'base',current_date)", [C.H]);
ok("C: não dá 'upgrade' para plano abaixo/igual ao atual", !!r.err && /plano acima/.test(r.err), r.err);
const idU = (await sv("select public.platform_upgrade_issue($1,'maximo') id", [C.H])).rows[0].id;
const cu = (await sv("select * from platform_charges where id=$1", [idU])).rows[0];
ok("C: fatura de upgrade com o valor cotado, sem período", Number(cu.amount_cents) === expected && cu.period_start === null && cu.idempotency_key.startsWith("upgrade:") && cu.item_key === "plan:maximo");
ok("C: repetir reaproveita", (await sv("select public.platform_upgrade_issue($1,'maximo') id", [C.H])).rows[0].id === idU);
const bdBefore = (await sv("select billing_day from house_billing_plan where house_id=$1", [C.H])).rows[0].billing_day;
await pay(idU, expected);
const hC = (await sv("select h.plan::text, p.billing_day from houses h join house_billing_plan p on p.house_id=h.id where h.id=$1", [C.H])).rows[0];
ok("C: pago, o plano sobe na hora e o dia de cobrança não muda", hC.plan === "maximo" && hC.billing_day === bdBefore, JSON.stringify(hC));
ok("C: evento upgrade_aplicado registrado", (await sv("select count(*)::int n from platform_billing_events where kind='upgrade_aplicado' and charge_id=$1", [idU])).rows[0].n === 1);

// ---- D) bloqueios do upgrade
const Gb0 = await mk("gb0", "base");
const D1 = await mk("d1", "intermediario", { billing: billingDayFor(10) });
await oldPaid(D1.H, "intermediario");
await sv("select public.platform_charge_issue($1,'plan','plan:intermediario',$2::bigint,current_date+5,current_date+5,'renovação',$3)", [D1.H, cents("intermediario"), `plan:${D1.H}:fut1`]);
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [D1.H]);
ok("D: fatura da próxima renovação em aberto bloqueia o upgrade", !!r.err && /próxima renovação já foi gerada/.test(r.err), r.err);
const D2 = await mk("d2", "intermediario", { billing: billingDayFor(10) });
await oldPaid(D2.H, "intermediario");
const f2 = (await sv("select public.platform_charge_issue($1,'plan','plan:intermediario',$2::bigint,current_date+5,current_date+5,'renovação',$3) id", [D2.H, cents("intermediario"), `plan:${D2.H}:fut2`])).rows[0].id;
await pay(f2, cents("intermediario"));
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [D2.H]);
ok("D: renovação futura já paga também bloqueia", !!r.err && /próxima renovação já foi gerada/.test(r.err), r.err);
const D3 = await mk("d3", "intermediario", { billing: billingDayFor(10) });
await oldPaid(D3.H, "intermediario");
await sv("select public.platform_charge_issue($1,'plan','plan:intermediario',$2::bigint,current_date-3,current_date-3,'atrasada',$3)", [D3.H, cents("intermediario"), `plan:${D3.H}:atr`]);
await sv("update platform_charges set status='vencida' where house_id=$1 and idempotency_key like 'plan:%atr'", [D3.H]);
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [D3.H]);
ok("D: fatura em atraso bloqueia", !!r.err && /em atraso/.test(r.err), r.err);
const D4 = await mk("d4", "intermediario", { billing: billingDayFor(10), startedAgo: 2 });
const id4 = (await sv("select public.platform_charge_issue($1,'plan','plan:intermediario',$2::bigint,current_date,current_date,'primeiro',$3) id", [D4.H, cents("intermediario"), `plan:${D4.H}:first`])).rows[0].id;
await pay(id4, cents("intermediario"));
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [D4.H]);
ok("D: nos 7 dias do primeiro pagamento o upgrade fica indisponível (reembolso preservado)", !!r.err && /7 dias do primeiro pagamento/.test(r.err), r.err);
const D5 = await mk("d5", "intermediario", { billing: billingDayFor(10) });
await oldPaid(D5.H, "intermediario");
await sv("insert into house_billing_state(house_id, cancel_at) values ($1, current_date + 3)", [D5.H]);
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [D5.H]);
ok("D: cancelamento agendado bloqueia", !!r.err && /cancelamento agendado/.test(r.err), r.err);
await sv("update platform_settings set value = jsonb_set(value,'{enabled}','false') where key='billing_config'");
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [D5.H]);
ok("D: com a cobrança da plataforma desligada nada é cotado", !!r.err && /ainda não está ativa/.test(r.err), r.err);
r = await sv("select public.platform_subscribe_issue($1,'maximo')", [Gb0.H]);
ok("D: nem a assinatura é emitida", !!r.err && /ainda não está ativa/.test(r.err), r.err);
await sv("update platform_settings set value = jsonb_set(value,'{enabled}','true') where key='billing_config'");

// ---- E) descer de plano na renovação
const E = await mk("e", "maximo", { billing: billingDayFor(10) });
await oldPaid(E.H, "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 2)", [E.H]);
r = await as(E.O, (c) => q(c, "select public.my_plan_change_schedule('intermediario') r"));
ok("E: a casa agenda a descida", !r.err, r.err);
const eff = iso(r.rows[0].r.effective_on);
const c0 = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), billingDayFor(10)));
if (c0 <= t0) c0.setUTCMonth(c0.getUTCMonth() + 1);
ok("E: vale na próxima renovação", eff === iso(c0), `${eff} vs ${iso(c0)}`);
ok("E: o plano continua o mesmo até lá", (await sv("select plan::text p from houses where id=$1", [E.H])).rows[0].p === "maximo");
r = await as(E.O, (c) => q(c, "select public.my_plan_change_schedule('maximo')"));
ok("E: não agenda 'descida' para o mesmo plano ou acima", !!r.err && /abaixo do atual/.test(r.err), r.err);
r = await as(E.O, (c) => q(c, "select public.my_plan_change_undo() r"));
ok("E: desfaz antes da fatura da renovação", !r.err && (await sv("select pending_plan from house_billing_plan where house_id=$1", [E.H])).rows[0].pending_plan === null, r.err);
await as(E.O, (c) => q(c, "select public.my_plan_change_schedule('intermediario')"));
// a rotina emite a renovação do ciclo seguinte já com o plano novo (aviso de 7 dias antes do dia de cobrança)
await sv("update house_billing_plan set billing_day=$2, pending_plan_on=current_date+3 where house_id=$1", [E.H, billingDayFor(3)]);
const pon = iso((await sv("select pending_plan_on d from house_billing_plan where house_id=$1", [E.H])).rows[0].d);
await sv("update house_billing_plan set pending_plan_on = $2::date where house_id=$1", [E.H, iso(new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), billingDayFor(3)) + (billingDayFor(3) <= t0.getUTCDate() ? 31 * 864e5 : 0)))]);
await sv("select public.platform_billing_tick()");
const inv = (await sv("select item_key, amount_cents from platform_charges where house_id=$1 and idempotency_key like 'plan:%' and status='aberta' order by period_start desc limit 1", [E.H])).rows[0];
const seatInv = (await sv("select amount_cents from platform_charges where house_id=$1 and kind='extra_seat' and status='aberta' order by period_start desc limit 1", [E.H])).rows[0];
ok("E: a fatura da renovação sai com o plano novo", inv && inv.item_key === "plan:intermediario" && Number(inv.amount_cents) === cents("intermediario"), JSON.stringify(inv));
const seatPrice = Number((await sv("select value #>> '{extra_seat,intermediario}' p from platform_settings where key='billing_prices'")).rows[0].p);
ok("E: vagas extras cobradas pelo preço do plano novo (sem duplicar)", !!seatInv && Number(seatInv.amount_cents) === 2 * seatPrice, JSON.stringify(seatInv));
r = await as(E.O, (c) => q(c, "select public.my_plan_change_undo()"));
ok("E: com a fatura do plano novo já emitida não dá mais para desfazer", !!r.err && /já foi gerada/.test(r.err), r.err);
// chega o dia: a descida é aplicada
await sv("update house_billing_plan set pending_plan_on = current_date where house_id=$1", [E.H]);
await sv("select public.platform_billing_tick()");
ok("E: no dia da renovação a casa passa para o plano novo", (await sv("select h.plan::text p, p.pending_plan from houses h join house_billing_plan p on p.house_id=h.id where h.id=$1", [E.H])).rows[0].p === "intermediario");
ok("E: pendência limpa e evento registrado", (await sv("select count(*)::int n from house_billing_plan where house_id=$1 and pending_plan is null", [E.H])).rows[0].n === 1 && (await sv("select count(*)::int n from platform_billing_events where kind='plano_reduzido' and reason like $1", [E.H + "%"])).rows[0].n === 1);

// ---- F) voltar ao Base
const F = await mk("f", "intermediario", { billing: billingDayFor(10) });
await oldPaid(F.H, "intermediario");
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,last4,auto_enabled,saved_on) values ($1,'stripe','cus_f','pm_f','4242',true,current_date-10)", [F.H]);
r = await as(F.O, (c) => q(c, "select public.my_plan_change_schedule('base') r"));
ok("F: agenda a volta ao Base", !r.err, r.err);
await sv("update house_billing_plan set pending_plan_on = current_date where house_id=$1", [F.H]);
await sv("select public.platform_billing_tick()");
const hF = (await sv("select h.plan::text p, b.active, c.auto_enabled from houses h join house_billing_plan b on b.house_id=h.id join house_card_on_file c on c.house_id=h.id where h.id=$1", [F.H])).rows[0];
ok("F: no dia, a casa vai ao Base, a cobrança mensal para e o cartão automático desliga", hF.p === "base" && hF.active === false && hF.auto_enabled === false, JSON.stringify(hF));
ok("F: a casa não fica suspensa nem inativa", (await sv("select count(*)::int n from house_billing_state where house_id=$1 and (suspended or total or cancelled_at is not null)", [F.H])).rows[0].n === 0);
const idF = (await sv("select public.platform_subscribe_issue($1,'maximo') id", [F.H]));
ok("F: depois, pode assinar de novo", !idF.err, idF.err);
await pay(idF.rows[0].id, cents("maximo"));
ok("F: reassinatura reativa a matrícula sem pendência", (await sv("select h.plan::text p, b.active, b.pending_plan from houses h join house_billing_plan b on b.house_id=h.id where h.id=$1", [F.H])).rows.every((x) => x.p === "maximo" && x.active && x.pending_plan === null));

// ---- H) regressões: renovação normal e reembolso de 7 dias da primeira assinatura
const H1 = await mk("h1", "intermediario", { billing: billingDayFor(3) });
await oldPaid(H1.H, "intermediario");
await sv("select public.platform_billing_tick()");
const rn = (await sv("select item_key, amount_cents, period_start from platform_charges where house_id=$1 and idempotency_key like 'plan:%' and status='aberta'", [H1.H])).rows;
ok("H: renovação normal (sem troca agendada) sai com o plano atual", rn.length >= 1 && rn.every((x) => x.item_key === "plan:intermediario" && Number(x.amount_cents) === cents("intermediario")), JSON.stringify(rn));
await sv("select public.platform_billing_tick()");
ok("H: rodar a rotina de novo não duplica a fatura", (await sv("select count(*)::int n from platform_charges where house_id=$1 and idempotency_key like 'plan:%' and period_start is not null", [H1.H])).rows[0].n === rn.length);
const H2 = await mk("h2", "base");
const idH = (await sv("select public.platform_subscribe_issue($1,'intermediario') id", [H2.H])).rows[0].id;
await pay(idH, cents("intermediario"));
const rb = await sv("select public.platform_plan_refund_begin($1,$2,$3) r", [H2.H, idH, H2.O]);
ok("H: a primeira assinatura feita no app tem o reembolso de 7 dias", !rb.err, rb.err);
if (!rb.err) await sv("select public.platform_plan_refund_done($1,'re_h')", [rb.rows[0].r.refund_id]);
ok("H: reembolsada, a casa fica inativa como no fluxo de sempre", (await sv("select count(*)::int n from house_billing_state where house_id=$1 and cancelled_at is not null", [H2.H])).rows[0].n === 1);
r = await sv("select public.platform_upgrade_quote($1,'maximo',current_date)", [H2.H]);
ok("H: casa reembolsada não sobe de plano (usa a reativação)", !!r.err, r.err);

// ---- G) status para a tela e permissões
r = await as(C.O, (c) => q(c, "select public.my_plan_change_status() s"));
ok("G: status da casa assinante", !r.err && r.rows[0].s.subscribed === true && r.rows[0].s.plan === "maximo", r.err || JSON.stringify(r.rows[0].s));
r = await as(A.O, (c) => q(c, "select public.my_plan_change_status() s"));
ok("G: status traz upgrades possíveis com valor e motivos de bloqueio", !r.err && typeof r.rows[0].s.upgrades === "object" && typeof r.rows[0].s.upgrade_blocked === "object", r.err);
const Gb = await mk("gb", "base");
r = await as(Gb.O, (c) => q(c, "select public.my_plan_change_status() s"));
ok("G: casa sem assinatura aparece como não assinante", !r.err && r.rows[0].s.subscribed === false, r.err);
const anon = await connect(name);
await anon.query("set role anon");
r = await q(anon, "select public.my_plan_change_status()");
ok("G: anônimo não chama as funções da casa", !!r.err, r.err);
await anon.end();
r = await as(C.O, (c) => q(c, "select public.platform_upgrade_issue($1,'maximo')", [C.H]));
ok("G: a casa não chama diretamente a emissão de fatura", !!r.err, r.err);
r = await as(C.O, (c) => q(c, "select public.platform_subscribe_issue($1,'maximo')", [C.H]));
ok("G: nem a de assinatura", !!r.err, r.err);
r = await as(C.O, (c) => q(c, "select public.platform_plan_pending_apply_due()"));
ok("G: nem a aplicação da descida", !!r.err, r.err);
r = await as(C.O, (c) => q(c, "update house_billing_plan set pending_plan='base', pending_plan_on=current_date where house_id=$1", [C.H]));
ok("G: a casa não grava a troca agendada direto na tabela", (await sv("select pending_plan from house_billing_plan where house_id=$1", [C.H])).rows[0].pending_plan === null, r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total}/${total})`);
process.exit(bad ? 1 : 0);
