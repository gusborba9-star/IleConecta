// Verificação LOCAL da migration 0125 (vaga extra de equipe no app).
// Uso: node supabase/verify/verify_0125.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"], ["0125_contratacao_de_plano_no_app.sql", "-- ============ 8) permissões ============"]];
const name = "vf0125";
const { c: su, failed } = await freshDb(name, { with64: true, max: 124 });
ok("migrations 0001–0124 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) { try { await su.query(part(f, m)); } catch { /* assinatura antiga */ } }
const mig = readFileSync(new URL("../migrations/0125_vaga_extra_de_equipe.sql", import.meta.url), "utf8");
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0125 aplica e reaplica sem erro", e0 === null, e0 ?? "");
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
  const O = `b0125000-0000-0000-0000-00000000${hex}`, H = `d0125000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-$3::int,true)", [H, billing, startedAgo]);
  return { O, H };
}
let n = 0;
const pay = async (id, amount) => {
  const ref = `cs_0125_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amount]);
  if (r.err) throw new Error(r.err);
};
// primeiro pagamento antigo (fora da janela de 7 dias), para a casa poder trocar de plano
const oldPaid = async (H, plan) => {
  const id = (await sv("select public.platform_charge_issue($1,'plan',$2,$3::bigint,current_date-40,current_date-40,'teste',$4) id", [H, "plan:" + plan, cents(plan), `v0125-old-${++n}`])).rows[0].id;
  await pay(id, cents(plan));
  const up = await force("update platform_charges set paid_at = now() - interval '40 days', created_at = now() - interval '40 days' where id=$1", [id]); if (up.err) console.log("UPD ERR", up.err);
  return id;
};
const billingDayFor = (offset) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + offset); return Math.min(d.getUTCDate(), 28); };
// CASOS
const PRICE = async (plan) => Number((await sv("select public.platform_billing_prices() -> 'extra_seat' ->> $1 p", [plan])).rows[0].p);
const status = (O) => as(O, (c) => q(c, "select public.my_seat_status() s")).then((x) => x.rows?.[0]?.s);
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;

// ---- A) comprar a vaga
const A = await mk("a", "maximo", { billing: billingDayFor(-10) });
let st = await status(A.O);
const pMax = await PRICE("maximo");
ok("A: status mostra valor proporcional (mensal × dias que faltam ÷ dias do ciclo)", st?.quote && Number(st.quote.monthly_cents) === pMax && Number(st.quote.amount_cents) === Math.round(pMax * st.quote.days_left / st.quote.days_total) && st.quote.days_left >= 1 && st.quote.days_total >= 28, JSON.stringify(st));
ok("A: status traz vagas incluídas do plano, extras e em uso", st.included === 1 && st.extra === 0 && st.in_use === 0 && st.release_on === null, JSON.stringify(st));
let r = await sv("select public.platform_seat_issue($1) id", [A.H]);
ok("A: emite a fatura da vaga", !r.err && !!r.rows[0].id, r.err);
const idA = r.rows[0].id;
let ch = (await sv("select * from platform_charges where id=$1", [idA])).rows[0];
ok("A: fatura kind extra_seat, chave upgrade:seat:, sem período, vence hoje, valor = cotação", ch.kind === "extra_seat" && ch.idempotency_key.startsWith("upgrade:seat:") && ch.period_start === null && iso(ch.due_date) === iso(today) && Number(ch.amount_cents) === Number(st.quote.amount_cents), JSON.stringify(ch));
ok("A: repetir reaproveita a mesma fatura", (await sv("select public.platform_seat_issue($1) id", [A.H])).rows[0].id === idA);
ok("A: sem avisos de fatura para a vaga", await cnt("select count(*)::int n from platform_billing_notices where charge_id=$1", [idA]) === 0);
ok("A: antes de pagar, a vaga NÃO é liberada", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [A.H]) === 0);
await pay(idA, Number(ch.amount_cents));
ok("A: pago, a casa passa a ter 1 vaga extra", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [A.H]) === 1);
await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [`cs_0125_${n}`, Number(ch.amount_cents)]);
ok("A: confirmar de novo não libera outra vaga", await cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [A.H]) === 1);
ok("A: notificação e evento de liberação", await cnt("select count(*)::int n from notifications where user_id=$1 and text like 'Pagamento confirmado: a vaga extra%'", [A.O]) === 1 && await cnt("select count(*)::int n from platform_billing_events where kind='vaga_liberada' and charge_id=$1", [idA]) === 1);
ok("A: o plano continua o mesmo e não houve upgrade", (await sv("select plan::text p from houses where id=$1", [A.H])).rows[0].p === "maximo" && await cnt("select count(*)::int n from platform_billing_events where kind='upgrade_aplicado' and reason=$1", [A.H]) === 0);
st = await status(A.O);
ok("A: status depois: 1 extra", st.extra === 1);

// ---- B) vaga e upgrade de plano não se atrapalham
const B = await mk("b", "base", { billing: billingDayFor(-10) });
await oldPaid(B.H, "base");
const seatB = (await sv("select public.platform_seat_issue($1) id", [B.H])).rows[0].id;
const upB = await sv("select public.platform_upgrade_issue($1,'maximo') id", [B.H]);
ok("B: upgrade de plano é emitido com fatura de vaga aberta", !upB.err && upB.rows[0].id !== seatB, upB.err);
ok("B: a fatura da vaga continua aberta", (await sv("select status from platform_charges where id=$1", [seatB])).rows[0].status === "aberta");
const seatB2 = (await sv("select public.platform_seat_issue($1) id", [B.H])).rows[0].id;
ok("B: pedir a vaga de novo reaproveita a fatura aberta e não cancela o upgrade", seatB2 === seatB && (await sv("select status from platform_charges where id=$1", [upB.rows[0].id])).rows[0].status === "aberta");
const pm = (await sv("select amount_cents from platform_charges where id=$1", [seatB])).rows[0].amount_cents;
await pay(seatB, Number(pm));
ok("B: pagar a vaga não muda o plano", (await sv("select plan::text p from houses where id=$1", [B.H])).rows[0].p === "base" && await cnt("select seats::int n from house_extra_seats where house_id=$1", [B.H]) === 1);
await pay(upB.rows[0].id, Number((await sv("select amount_cents from platform_charges where id=$1", [upB.rows[0].id])).rows[0].amount_cents));
ok("B: pagar o upgrade muda o plano e não cria vaga", (await sv("select plan::text p from houses where id=$1", [B.H])).rows[0].p === "maximo" && await cnt("select seats::int n from house_extra_seats where house_id=$1", [B.H]) === 1);

// ---- C) a rotina não cobra de novo o ciclo que já foi pago proporcionalmente, e cobra o próximo
const tickBefore = await cnt("select count(*)::int n from platform_charges where house_id=$1 and idempotency_key like 'extra_seat:%'", [A.H]);
await sv("select public.platform_billing_tick(now())");
ok("C: ciclo corrente (vaga paga hoje) não gera fatura mensal de vagas retroativa", await cnt("select count(*)::int n from platform_charges where house_id=$1 and idempotency_key like 'extra_seat:%' and period_start <= current_date", [A.H]) === 0 && tickBefore === 0);
const C = await mk("c", "maximo", { billing: billingDayFor(2) });
await sv("insert into house_extra_seats(house_id, seats) values ($1, 2)", [C.H]);
await sv("select public.platform_billing_tick(now())");
const ex = (await sv("select * from platform_charges where house_id=$1 and idempotency_key like 'extra_seat:%'", [C.H])).rows;
ok("C: renovação próxima emite a fatura mensal de vagas = vagas × preço", ex.length === 1 && Number(ex[0].amount_cents) === 2 * pMax && new Date(ex[0].period_start) > new Date(today), JSON.stringify(ex.map((x) => [x.amount_cents, x.period_start])));
r = await sv("select public.platform_seat_issue($1)", [C.H]);
ok("C: com a fatura mensal de vagas já gerada, a compra espera o vencimento", !!r.err && /próxima renovação já foi gerada/.test(r.err), r.err);

// ---- D) fatura de vaga esquecida nunca vira atraso
const D = await mk("d", "maximo", { billing: billingDayFor(-10) });
const idD = (await sv("select public.platform_seat_issue($1) id", [D.H])).rows[0].id;
await force("update platform_charges set due_date = current_date - 5, created_at = now() - interval '5 days' where id=$1", [idD]);
await sv("select public.platform_billing_tick(now())");
ok("D: fatura esquecida não vira vencida (é cancelada em silêncio)", ["cancelada", "aberta"].includes((await sv("select status from platform_charges where id=$1", [idD])).rows[0].status));
ok("D: casa sem fatura em atraso", await cnt("select count(*)::int n from platform_charges where house_id=$1 and status='vencida'", [D.H]) === 0);

// ---- E) reduzir: vale até a renovação
const E = await mk("e", "maximo", { billing: billingDayFor(-10) });
await sv("insert into house_extra_seats(house_id, seats) values ($1, 2)", [E.H]);
r = await as(E.O, (c) => q(c, "select public.my_seat_release_schedule(1) r"));
ok("E: agenda a redução para 1 vaga na próxima renovação", !r.err && r.rows[0].r.keep === 1 && new Date(r.rows[0].r.effective_on) > new Date(today), r.err ?? JSON.stringify(r.rows[0].r));
st = await status(E.O);
ok("E: seguem 2 vagas até a renovação; status mostra a redução", st.extra === 2 && st.release_to === 1 && !!st.release_on && /redução/.test(st.blocked ?? ""), JSON.stringify(st));
r = await as(E.O, (c) => q(c, "select public.my_seat_release_schedule(2) r"));
ok("E: não aceita manter igual ou mais que o atual", !!r.err && /menor que a atual/.test(r.err), r.err);
r = await as(E.O, (c) => q(c, "select public.my_seat_release_undo() r"));
ok("E: desfaz a redução", !r.err && (await status(E.O)).release_on === null, r.err);
await as(E.O, (c) => q(c, "select public.my_seat_release_schedule(0) r"));
const ron = (await status(E.O)).release_on;
r = await sv("select public.platform_seat_release_apply_due(($1::date - 1)::timestamptz) n", [ron]);
ok("E: antes do dia marcado nada muda", r.rows[0].n === 0 && await cnt("select seats::int n from house_extra_seats where house_id=$1", [E.H]) === 2);
r = await sv("select public.platform_seat_release_apply_due(($1::date + 0)::timestamptz + interval '12 hours') n", [ron]);
ok("E: no dia marcado as vagas caem para 0 e a redução é limpa", r.rows[0].n === 1 && await cnt("select seats::int n from house_extra_seats where house_id=$1", [E.H]) === 0 && (await status(E.O)).release_on === null, r.err);
ok("E: avisa a casa", await cnt("select count(*)::int n from notifications where user_id=$1 and text like 'As vagas extras de equipe foram reduzidas%'", [E.O]) === 1);
// fatura do ciclo seguinte usa o valor reduzido
const F = await mk("f", "maximo", { billing: billingDayFor(2) });
await sv("insert into house_extra_seats(house_id, seats, release_to, release_on) values ($1, 3, 1, $2::date + 2)", [F.H, iso(today)]);
await sv("select public.platform_billing_tick(now())");
const fx = (await sv("select amount_cents from platform_charges where house_id=$1 and idempotency_key like 'extra_seat:%'", [F.H])).rows;
ok("F: fatura mensal do ciclo da redução já vem com 1 vaga", fx.length === 1 && Number(fx[0].amount_cents) === pMax, JSON.stringify(fx));
r = await as(F.O, (c) => q(c, "select public.my_seat_release_undo() r"));
ok("F: com a fatura reduzida já gerada, não dá para desfazer", !!r.err && /já foi gerada com a redução/.test(r.err), r.err);

// ---- G) equipe em uso trava a redução
const G = await mk("g", "maximo", { billing: billingDayFor(-10) });
await sv("insert into house_extra_seats(house_id, seats) values ($1, 1)", [G.H]);
for (const k of [1, 2]) {
  const U = `b0125999-0000-0000-0000-00000000000${k}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [U, `staff${k}@x.com`]);
  const ins = await sv("insert into house_staff(house_id,user_id,name) values ($1,$2,$3)", [G.H, U, `Pessoa ${k}`]);
  if (ins.err) console.log("STAFF ERR", ins.err);
}
r = await as(G.O, (c) => q(c, "select public.my_seat_release_schedule(0) r"));
ok("G: com 2 pessoas na equipe e 1 vaga incluída, não reduz para 0", !!r.err && /Remova 1 pessoa/.test(r.err), r.err);

// ---- H) quem não assina e permissões
const H0 = await mk("h", "gratis");
st = await status(H0.O);
ok("H: casa sem assinatura vê o motivo e nenhuma cotação", st.subscribed === false && /não tem assinatura/.test(st.blocked) && st.quote === null, JSON.stringify(st));
r = await sv("select public.platform_seat_issue($1)", [H0.H]);
ok("H: servidor recusa emitir vaga para casa sem assinatura", !!r.err, r.err);
const acl = (await sv(`select has_function_privilege('anon','public.platform_seat_issue(uuid,timestamptz)','execute') a, has_function_privilege('authenticated','public.platform_seat_issue(uuid,timestamptz)','execute') b, has_function_privilege('service_role','public.platform_seat_issue(uuid,timestamptz)','execute') c,
  has_function_privilege('anon','public.my_seat_status()','execute') d, has_function_privilege('authenticated','public.my_seat_status()','execute') e, has_function_privilege('authenticated','public.platform_seat_quote(uuid,date)','execute') f,
  has_function_privilege('authenticated','public.platform_seat_release_apply_due(timestamptz)','execute') g, has_function_privilege('authenticated','public.platform_seat_bought_by_payment()','execute') h`)).rows[0];
ok("H: permissões (emitir/aplicar só servidor; my_* só logado; cotação e gatilho fechados)", !acl.a && !acl.b && acl.c && !acl.d && acl.e && !acl.f && !acl.g && !acl.h, JSON.stringify(acl));
r = await as(A.O, (c) => q(c, "select public.platform_seat_issue($1)", [A.H]));
ok("H: a casa não consegue emitir fatura chamando o banco direto", !!r.err, r.err);
ok("H: administração ao ajustar vagas limpa a redução agendada", /release_to = null/.test((await sv("select pg_get_functiondef('public.admin_set_house_seats(uuid,int)'::regprocedure) d")).rows[0].d));
// estorno do provedor só registra para revisão
const er = await sv("update platform_charges set status='estornada' where id=$1", [idA]);
ok("H: vaga estornada pelo provedor fica registrada para revisão e a vaga não some sozinha", !er.err && await cnt("select count(*)::int n from platform_billing_events where kind='vaga_estornada_revisar' and charge_id=$1", [idA]) === 1 && await cnt("select seats::int n from house_extra_seats where house_id=$1", [A.H]) === 1, er.err);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);
