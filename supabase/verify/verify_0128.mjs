// Verificação LOCAL da migration 0128 (arrependimento de 7 dias na 1ª contratação da vaga extra).
// Uso: node supabase/verify/verify_0128.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const cpfOf = (b9) => { const d = b9.split("").map(Number); const dv = (a) => { const s = a.reduce((t, x, i) => t + x * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(d); const d2 = dv([...d, d1]); return [...d, d1, d2].join(""); };
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"]];
const name = "vf0128";
const { c: su, failed } = await freshDb(name, { with64: true, max: 127 });
ok("migrations 0001–0127 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) { try { await su.query(part(f, m)); } catch { /* assinatura antiga */ } }
await su.query("insert into vault.secrets(name, secret) values ('tax_id_key', 'chave-de-teste-sec')");
const mig = readFileSync(new URL("../migrations/0128_arrependimento_vaga_extra.sql", import.meta.url), "utf8");
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0128 aplica e reaplica sem erro", e0 === null, e0 ?? "");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);
const force = async (sql, p) => { await su.query("set session_replication_role = replica"); const r = await q(su, sql, p); await su.query("set session_replication_role = origin"); if (r.err) console.log("FORCE ERR", r.err); return r; };
const today = (await sv("select (now() at time zone 'America/Sao_Paulo')::date d")).rows[0].d;
const billingDayFor = (offset) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + offset); return Math.min(d.getUTCDate(), 28); };
const PRICE = async (plan) => Number((await sv("select public.platform_billing_prices() -> 'extra_seat' ->> $1 p", [plan])).rows[0].p);
const pMax = await PRICE("maximo");
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
let seq = 0, n = 0;
async function mk(tag, plan, billing = billingDayFor(-10)) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0128000-0000-0000-0000-00000000${hex}`, H = `d0128000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  await sv("select public.tax_id_store($1,$2,$3,true)", [H, cpfOf(String(100000000 + i)), O]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-40,true)", [H, billing]);
  return { O, H };
}
const pay = async (id, amount) => {
  const ref = `cs_0128_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amount]);
  if (r.err) throw new Error(r.err);
};
// compra uma vaga: emite, paga e devolve o id da fatura
const buySeat = async (H) => {
  const iss = await sv("select public.platform_seat_issue($1) id", [H]); if (iss.err) throw new Error("issue: " + iss.err); const id = iss.rows[0].id;
  const amt = Number((await sv("select amount_cents from platform_charges where id=$1", [id])).rows[0].amount_cents);
  await pay(id, amt);
  return { id, amt };
};
const begin = (H, ch, by = null, now = null) => sv("select public.platform_seat_refund_begin($1,$2,$3,coalesce($4::timestamptz, now())) r", [H, ch, by, now]);
const done = (id, ref = "re_x") => sv("select public.platform_seat_refund_done($1,$2) r", [id, ref]);
const seatsOf = async (H) => cnt("select coalesce(sum(seats),0)::int n from house_extra_seats where house_id=$1", [H]);

// ---- A) caminho feliz
const A = await mk("a", "maximo");
const a = await buySeat(A.H);
let el = await as(A.O, (c) => q(c, "select public.my_seat_refunds() r"));
ok("A: logo após pagar, a tela da casa oferece o reembolso integral", el.rows?.[0]?.r.items.length === 1 && el.rows[0].r.items[0].charge_id === a.id && Number(el.rows[0].r.items[0].amount_cents) === a.amt && el.rows[0].r.window_days === 7, el.err ?? JSON.stringify(el.rows?.[0]?.r));
ok("A: antes do pedido, a casa tem 1 vaga", await seatsOf(A.H) === 1);
let b = await begin(A.H, a.id, A.O);
ok("A: begin registra o pedido (valor integral pago)", !b.err && Number(b.rows[0].r.amount_cents) === a.amt && b.rows[0].r.resume === false && b.rows[0].r.provider === "stripe" && !!b.rows[0].r.ref, b.err ?? JSON.stringify(b.rows?.[0]?.r));
ok("A: begin ainda NÃO tira a vaga nem mexe na fatura", await seatsOf(A.H) === 1 && (await sv("select status from platform_charges where id=$1", [a.id])).rows[0].status === "paga");
const rid = b.rows[0].r.refund_id;
let b2 = await begin(A.H, a.id, A.O);
ok("A: repetir begin retoma o mesmo reembolso (não duplica)", !b2.err && b2.rows[0].r.resume === true && b2.rows[0].r.refund_id === rid && await cnt("select count(*)::int n from platform_seat_refunds where charge_id=$1", [a.id]) === 1);
el = await as(A.O, (c) => q(c, "select public.my_seat_refunds() r"));
ok("A: com pedido em andamento a oferta some e o histórico mostra 'pendente'", el.rows[0].r.items.length === 0 && el.rows[0].r.history[0].status === "pendente");
let d1 = await done(rid, "re_123");
ok("A: done conclui", !d1.err && d1.rows[0].r.already === false && Number(d1.rows[0].r.amount_cents) === a.amt, d1.err);
ok("A: fatura vira estornada", (await sv("select status from platform_charges where id=$1", [a.id])).rows[0].status === "estornada");
ok("A: razão registra o estorno integral", await cnt("select count(*)::int n from platform_ledger_entries where charge_id=$1 and entry_type='estorno' and amount_cents=$2", [a.id, a.amt]) === 1);
ok("A: a vaga é retirada na hora", await seatsOf(A.H) === 0);
ok("A: NÃO gera alerta de revisão de vaga estornada (foi pedido da casa)", await cnt("select count(*)::int n from platform_billing_events where kind='vaga_estornada_revisar' and charge_id=$1", [a.id]) === 0 && await cnt("select count(*)::int n from platform_billing_events where kind='vaga_reembolsada' and charge_id=$1", [a.id]) === 1);
ok("A: notificação para a casa", await cnt("select count(*)::int n from notifications where user_id=$1 and text like 'Reembolso de R$%vaga extra de equipe foi retirada%'", [A.O]) === 1);
let d2 = await done(rid);
ok("A: done repetido não duplica (razão, vaga, aviso)", !d2.err && d2.rows[0].r.already === true && await cnt("select count(*)::int n from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [a.id]) === 1 && await seatsOf(A.H) === 0 && await cnt("select count(*)::int n from notifications where user_id=$1 and text like 'Reembolso de R$%'", [A.O]) === 1);
b = await begin(A.H, a.id, A.O);
ok("A: depois de concluído não dá para pedir de novo", !!b.err && /já foi reembolsada|não pode ser reembolsada/.test(b.err), b.err);
ok("A: o plano da casa e a assinatura seguem intactos", (await sv("select plan::text p from houses where id=$1", [A.H])).rows[0].p === "maximo" && await cnt("select count(*)::int n from house_billing_plan where house_id=$1 and active", [A.H]) === 1 && await cnt("select count(*)::int n from house_billing_state where house_id=$1 and cancelled_at is not null", [A.H]) === 0);
// uma segunda vaga pode ser comprada e reembolsada de novo (regra é por cobrança)
await force("update platform_charges set status='cancelada' where house_id=$1 and status='aberta'", [A.H]);
const a2 = await buySeat(A.H).catch((e) => ({ err: e.message }));
ok("A: depois do reembolso a casa pode comprar outra vaga", !a2.err && await seatsOf(A.H) === 1, a2.err);

// ---- B) janela de 7 dias
const B = await mk("b", "maximo");
const bb = await buySeat(B.H);
await force("update platform_charges set paid_at = now() - interval '6 days 23 hours' where id=$1", [bb.id]);
ok("B: aos 6d23h ainda pode", !(await begin(B.H, bb.id)).err);
const B2 = await mk("b2", "maximo");
const bb2 = await buySeat(B2.H);
await force("update platform_charges set paid_at = now() - interval '7 days 1 hour' where id=$1", [bb2.id]);
b = await begin(B2.H, bb2.id);
ok("B: aos 7d1h o prazo passou", !!b.err && /prazo de 7 dias/.test(b.err), b.err);
el = await as(B2.O, (c) => q(c, "select public.my_seat_refunds() r"));
ok("B: fora do prazo a tela não oferece", el.rows[0].r.items.length === 0);
ok("B: nada foi registrado nem alterado", await cnt("select count(*)::int n from platform_seat_refunds where charge_id=$1", [bb2.id]) === 0 && await seatsOf(B2.H) === 1);

// ---- C) o que NÃO é elegível
const C = await mk("c", "maximo");
const cc = await buySeat(C.H);
const other = await mk("c2", "maximo");
b = await begin(other.H, cc.id);
ok("C: outra casa não reembolsa a vaga de terceiros", !!b.err && /não pode ser reembolsada/.test(b.err), b.err);
const planCh = (await sv("select public.platform_charge_issue($1,'plan','plan:maximo',$2::bigint,current_date,current_date,'t',$3) id", [C.H, 28490, "v0128-plan-1"])).rows[0].id;
await pay(planCh, 28490);
b = await begin(C.H, planCh);
ok("C: fatura de plano não passa por aqui", !!b.err && /não pode ser reembolsada/.test(b.err), b.err);
const renew = (await sv("select public.platform_charge_issue($1,'extra_seat','extra_seat',$2::bigint,current_date,current_date,'t',$3) id", [C.H, pMax, "extra_seat:" + C.H + ":2099-01-01"])).rows[0].id;
await pay(renew, pMax);
b = await begin(C.H, renew);
ok("C: renovação mensal da vaga NÃO tem arrependimento", !!b.err && /não pode ser reembolsada/.test(b.err), b.err);
const open = (await sv("select public.platform_seat_issue($1) id", [other.H]).catch(() => ({}))).rows?.[0]?.id;
b = open ? await begin(other.H, open) : { err: "n/a" };
ok("C: fatura de vaga ainda aberta (não paga) não é reembolsável", !!b.err, b.err);
b = await begin(C.H, "00000000-0000-0000-0000-000000000000");
ok("C: cobrança inexistente", !!b.err && /não pode ser reembolsada/.test(b.err), b.err);
const pending = await sv("select count(*)::int n from platform_seat_refunds where charge_id in ($1,$2,$3)", [planCh, renew, cc.id]);
ok("C: nenhuma dessas tentativas deixou registro", pending.rows[0].n === 0);

// ---- D) equipe em uso trava
const D = await mk("d", "maximo");
const dd = await buySeat(D.H);
for (const k of [1, 2]) {
  const U = `b0128999-0000-0000-0000-00000000000${k}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [U, `staff${k}@x.com`]);
  await sv("insert into house_staff(house_id,user_id,name) values ($1,$2,$3)", [D.H, U, `Pessoa ${k}`]);
}
b = await begin(D.H, dd.id);
ok("D: 2 pessoas na equipe (1 incluída + 1 extra) → reembolso exige remover 1", !!b.err && /Remova 1 pessoa\(s\) da equipe antes de pedir o reembolso/.test(b.err), b.err);
await sv("delete from house_staff where house_id=$1 and name='Pessoa 2'", [D.H]);
const dbg = await begin(D.H, dd.id);
ok("D: removida a pessoa, o pedido passa", !dbg.err, dbg.err);
// corrida: entra alguém na equipe entre o pedido e a conclusão → o dinheiro volta mesmo assim e a administração é avisada
await sv("insert into house_staff(house_id,user_id,name) values ($1,$2,$3)", [D.H, "b0128999-0000-0000-0000-000000000002", "Pessoa 2"]);
const dfin = await done(dbg.rows[0].r.refund_id);
ok("D: equipe passou da capacidade no meio do caminho → concluído e evento para a administração", !dfin.err && await cnt("select count(*)::int n from platform_billing_events where kind='vaga_reembolsada_equipe_excedente' and charge_id=$1", [dd.id]) === 1, dfin.err);

// ---- E) redução agendada é ajustada
const E = await mk("e", "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 1)", [E.H]);
const ee = await buySeat(E.H); // agora 2 vagas
await sv("update house_extra_seats set release_to=1, release_on=current_date+10 where house_id=$1", [E.H]);
let eb = await begin(E.H, ee.id); await done(eb.rows[0].r.refund_id);
ok("E: 2 vagas com redução para 1 → reembolso → 1 vaga e a redução (que viraria 1→1) é desfeita", await seatsOf(E.H) === 1 && await cnt("select count(*)::int n from house_extra_seats where house_id=$1 and release_on is null and release_to is null", [E.H]) === 1);
const E2 = await mk("e2", "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 2)", [E2.H]);
const ee2 = await buySeat(E2.H); // 3 vagas
await sv("update house_extra_seats set release_to=1, release_on=current_date+10 where house_id=$1", [E2.H]);
eb = await begin(E2.H, ee2.id); await done(eb.rows[0].r.refund_id);
ok("E: 3 vagas com redução para 1 → reembolso → 2 vagas e a redução para 1 continua", (await sv("select seats, release_to from house_extra_seats where house_id=$1", [E2.H])).rows[0].seats === 2 && (await sv("select release_to from house_extra_seats where house_id=$1", [E2.H])).rows[0].release_to === 1);
const E3 = await mk("e3", "maximo");
const ee3 = await buySeat(E3.H);
await force("update house_extra_seats set seats = 0 where house_id=$1", [E3.H]);
eb = await begin(E3.H, ee3.id); const ed = await done(eb.rows[0].r.refund_id);
ok("E: se a vaga já tinha saído (0), o dinheiro volta e as vagas nunca ficam negativas", !ed.err && await seatsOf(E3.H) === 0);

// ---- F) fatura mensal de vagas já emitida depois da compra
const F = await mk("f", "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 1)", [F.H]);
const ff = await buySeat(F.H); // 2 vagas
const m1 = (await sv("select public.platform_charge_issue($1,'extra_seat','extra_seat',$2::bigint,current_date+7,current_date+7,'Vagas adicionais de equipe (2)',$3) id", [F.H, 2 * pMax, `extra_seat:${F.H}:K1`])).rows[0].id;
eb = await begin(F.H, ff.id); const fd = await done(eb.rows[0].r.refund_id);
ok("F: fatura mensal aberta com 2 vagas é cancelada e refeita com 1", !fd.err && fd.rows[0].r.invoices_redone === 1 && (await sv("select status from platform_charges where id=$1", [m1])).rows[0].status === "cancelada", fd.err ?? JSON.stringify(fd.rows[0].r));
const nw = (await sv("select * from platform_charges where house_id=$1 and idempotency_key=$2", [F.H, `extra_seat:${F.H}:K1:r1`])).rows[0];
ok("F: a nova fatura vale 1 vaga, mesmo vencimento e período, chave :r1", !!nw && Number(nw.amount_cents) === pMax && nw.status === "aberta" && String(nw.due_date) === String((await sv("select due_date from platform_charges where id=$1", [m1])).rows[0].due_date), JSON.stringify(nw));
ok("F: o total a cobrar das vagas é exatamente 1 × preço (sem duplicar)", await cnt("select coalesce(sum(amount_cents),0)::int n from platform_charges where house_id=$1 and idempotency_key like 'extra_seat:%' and status in ('aberta','vencida')", [F.H]) === pMax);
const F2 = await mk("f2", "maximo");
const ff2 = await buySeat(F2.H); // 1 vaga
const m2 = (await sv("select public.platform_charge_issue($1,'extra_seat','extra_seat',$2::bigint,current_date+7,current_date+7,'Vagas adicionais de equipe (1)',$3) id", [F2.H, pMax, `extra_seat:${F2.H}:K1`])).rows[0].id;
eb = await begin(F2.H, ff2.id); await done(eb.rows[0].r.refund_id);
ok("F: fatura mensal de 1 vaga cancelada e NÃO refeita quando sobram 0 vagas", (await sv("select status from platform_charges where id=$1", [m2])).rows[0].status === "cancelada" && await cnt("select count(*)::int n from platform_charges where house_id=$1 and idempotency_key like $2", [F2.H, `extra_seat:${F2.H}:K1:r%`]) === 0);
const F3 = await mk("f3", "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 1)", [F3.H]);
const ff3 = await buySeat(F3.H);
const m3 = (await sv("select public.platform_charge_issue($1,'extra_seat','extra_seat',$2::bigint,current_date+7,current_date+7,'Vagas adicionais de equipe (2)',$3) id", [F3.H, 2 * pMax, `extra_seat:${F3.H}:K1`])).rows[0].id;
await force("update platform_charges set status='em_processamento' where id=$1", [m3]);
b = await begin(F3.H, ff3.id);
ok("F: fatura mensal em pagamento → o pedido é barrado com orientação ao suporte", !!b.err && /Fale com o suporte para o reembolso desta vaga/.test(b.err), b.err);
const F4 = await mk("f4", "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 1)", [F4.H]);
const ff4 = await buySeat(F4.H);
await force("insert into platform_charges (house_id, kind, item_key, description, amount_cents, period_start, due_date, idempotency_key, status, created_at, paid_at, paid_amount_cents, paid_ref, provider) values ($1,'extra_seat','extra_seat','velha',$2,current_date-30,current_date-30,$3,'paga', now() - interval '31 days', now() - interval '31 days', $2, 'cs_old', 'stripe')", [F4.H, pMax, `extra_seat:${F4.H}:OLD`]);
b = await begin(F4.H, ff4.id);
ok("F: fatura mensal antiga (emitida ANTES da compra) não atrapalha", !b.err, b.err);
// a rotina diária depois do reembolso não cobra a vaga retirada
const G = await mk("g", "maximo", billingDayFor(2));
const gg = await buySeat(G.H);
eb = await begin(G.H, gg.id); await done(eb.rows[0].r.refund_id);
await sv("select public.platform_billing_tick(now())");
ok("G: depois do reembolso a rotina mensal não emite fatura de vaga", await cnt("select count(*)::int n from platform_charges where house_id=$1 and idempotency_key like 'extra_seat:%'", [G.H]) === 0);

// ---- M) a trava da redução continua valendo (e reconhece a fatura refeita ":r1")
const M = await mk("m", "maximo");
await sv("insert into house_extra_seats(house_id, seats) values ($1, 2)", [M.H]);
let ms = await as(M.O, (c) => q(c, "select public.my_seat_release_schedule(1) r"));
ok("M: reduzir 2→1 agenda para a próxima renovação (comportamento da 0125 preservado)", !ms.err && ms.rows[0].r.keep === 1, ms.err);
const eff = ms.rows[0].r.effective_on;
await as(M.O, (c) => q(c, "select public.my_seat_release_undo()"));
await sv("select public.platform_charge_issue($1,'extra_seat','extra_seat',$2::bigint,$3::date,$3::date,'Vagas (2)',$4)", [M.H, 2 * pMax, eff, `extra_seat:${M.H}:${new Date(eff).toISOString().slice(0, 10)}:r1`]);
ms = await as(M.O, (c) => q(c, "select public.my_seat_release_schedule(1) r"));
ok("M: com fatura (inclusive a refeita :r1) já emitida para a renovação, a redução vai para o ciclo seguinte", !ms.err && new Date(ms.rows[0].r.effective_on) > new Date(eff), ms.err ?? `${eff} -> ${ms.rows?.[0]?.r.effective_on}`);

// ---- H) falha do provedor
const H = await mk("h", "maximo");
const hh = await buySeat(H.H);
eb = await begin(H.H, hh.id); const hid = eb.rows[0].r.refund_id;
await sv("select public.platform_seat_refund_fail($1,'card_declined')", [hid]);
ok("H: recusa do provedor: reembolso 'falhou', a vaga e a fatura ficam como estavam", (await sv("select status from platform_seat_refunds where id=$1", [hid])).rows[0].status === "falhou" && await seatsOf(H.H) === 1 && (await sv("select status from platform_charges where id=$1", [hh.id])).rows[0].status === "paga");
ok("H: a casa é avisada", await cnt("select count(*)::int n from notifications where user_id=$1 and text like 'Não foi possível concluir o reembolso da vaga%'", [H.O]) === 1);
ok("H: falhou liberado → a tela volta a oferecer e dá para tentar de novo dentro do prazo", (await as(H.O, (c) => q(c, "select public.my_seat_refunds() r"))).rows[0].r.items.length === 1 && !(await begin(H.H, hh.id)).err);
const dd2 = await done(hid);
ok("H: done em reembolso que falhou é recusado", !!dd2.err && /encerrado sem estorno/.test(dd2.err), dd2.err);
await sv("select public.platform_seat_refund_fail($1,'x')", [hid]);
ok("H: fail repetido é inofensivo", true);

// ---- I) pendentes sem resposta do provedor
const I = await mk("i", "maximo");
const ii = await buySeat(I.H);
eb = await begin(I.H, ii.id);
ok("I: pendente recém-criado ainda não aparece (espera 2 min)", (await sv("select count(*)::int n from platform_seat_refunds_pending()")).rows[0].n === 0);
await force("update platform_seat_refunds set created_at = now() - interval '5 minutes' where id=$1", [eb.rows[0].r.refund_id]);
const pend = await sv("select * from platform_seat_refunds_pending()");
ok("I: depois de 2 min aparece para a rotina refazer com a mesma chave", pend.rows.length === 1 && pend.rows[0].refund_id === eb.rows[0].r.refund_id && pend.rows[0].provider === "stripe" && Number(pend.rows[0].amount_cents) === ii.amt);

// ---- J) concorrência: dois pedidos ao mesmo tempo
const J = await mk("j", "maximo");
const jj = await buySeat(J.H);
let [r1, r2] = await Promise.all([0, 1].map(async () => { const c = await connect(name); try { return await q(c, "select public.platform_seat_refund_begin($1,$2,null,now()) r", [J.H, jj.id]); } finally { await c.end(); } }));
ok("J: dois begin simultâneos geram UM reembolso", await cnt("select count(*)::int n from platform_seat_refunds where charge_id=$1", [jj.id]) === 1 && !r1.err && !r2.err && r1.rows[0].r.refund_id === r2.rows[0].r.refund_id, JSON.stringify([r1.err, r2.err]));
const jid = r1.rows[0].r.refund_id;
const [d3, d4] = await Promise.all([0, 1].map(async () => { const c = await connect(name); try { return await q(c, "select public.platform_seat_refund_done($1,'re_c') r", [jid]); } finally { await c.end(); } }));
ok("J: dois done simultâneos retiram UMA vaga e lançam UM estorno", await seatsOf(J.H) === 0 && await cnt("select count(*)::int n from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [jj.id]) === 1 && !d3.err && !d4.err, JSON.stringify([d3.err, d4.err]));

// ---- K) estorno do provedor (chargeback) continua sendo só sinalizado
const K = await mk("k", "maximo");
const kk = await buySeat(K.H);
await sv("update platform_charges set status='estornada' where id=$1", [kk.id]);
ok("K: chargeback fora do fluxo da casa ainda gera o alerta de revisão e mantém a vaga", await cnt("select count(*)::int n from platform_billing_events where kind='vaga_estornada_revisar' and charge_id=$1", [kk.id]) === 1 && await seatsOf(K.H) === 1);

// ---- L) segurança
const L = await mk("l", "maximo");
const ll = await buySeat(L.H);
const acl = (await sv(`select
 has_function_privilege('anon','public.platform_seat_refund_begin(uuid,uuid,uuid,timestamptz)','execute') a1, has_function_privilege('authenticated','public.platform_seat_refund_begin(uuid,uuid,uuid,timestamptz)','execute') a2, has_function_privilege('service_role','public.platform_seat_refund_begin(uuid,uuid,uuid,timestamptz)','execute') a3,
 has_function_privilege('anon','public.platform_seat_refund_done(uuid,text,timestamptz)','execute') b1, has_function_privilege('authenticated','public.platform_seat_refund_done(uuid,text,timestamptz)','execute') b2, has_function_privilege('service_role','public.platform_seat_refund_done(uuid,text,timestamptz)','execute') b3,
 has_function_privilege('anon','public.platform_seat_refund_fail(uuid,text)','execute') c1, has_function_privilege('authenticated','public.platform_seat_refund_fail(uuid,text)','execute') c2,
 has_function_privilege('anon','public.platform_seat_refunds_pending(interval)','execute') d1, has_function_privilege('authenticated','public.platform_seat_refunds_pending(interval)','execute') d2,
 has_function_privilege('anon','public.my_seat_refunds()','execute') e1, has_function_privilege('authenticated','public.my_seat_refunds()','execute') e2,
 has_function_privilege('anon','public.my_seat_release_schedule(int)','execute') f1, has_function_privilege('authenticated','public.my_seat_release_schedule(int)','execute') f2,
 has_function_privilege('authenticated','public.platform_seat_refunded_flag()','execute') g1, has_function_privilege('authenticated','public.platform_seat_refunds_guard()','execute') g2,
 has_table_privilege('anon','public.platform_seat_refunds','select') t1, has_table_privilege('authenticated','public.platform_seat_refunds','insert') t2, has_table_privilege('authenticated','public.platform_seat_refunds','update') t3, has_table_privilege('authenticated','public.platform_seat_refunds','delete') t4, has_table_privilege('authenticated','public.platform_seat_refunds','select') t5`)).rows[0];
ok("L: begin/done/fail/pending só o servidor; my_* só logado; gatilhos fechados", !acl.a1 && !acl.a2 && acl.a3 && !acl.b1 && !acl.b2 && acl.b3 && !acl.c1 && !acl.c2 && !acl.d1 && !acl.d2 && !acl.e1 && acl.e2 && !acl.f1 && acl.f2 && !acl.g1 && !acl.g2, JSON.stringify(acl));
ok("L: tabela de reembolsos: só leitura para logado; nada para anon, nada de escrever", !acl.t1 && !acl.t2 && !acl.t3 && !acl.t4 && acl.t5, JSON.stringify(acl));
r1 = await as(L.O, (c) => q(c, "select public.platform_seat_refund_begin($1,$2)", [L.H, ll.id]));
ok("L: a casa não consegue iniciar reembolso chamando o banco direto", !!r1.err, r1.err);
r1 = await as(L.O, (c) => q(c, "select public.platform_seat_refund_done(gen_random_uuid(),'x')"));
ok("L: nem concluir um reembolso", !!r1.err, r1.err);
r1 = await as(L.O, (c) => q(c, "insert into platform_seat_refunds(charge_id,house_id,amount_cents) values ($1,$2,100)", [ll.id, L.H]));
ok("L: nem inserir direto na tabela", !!r1.err, r1.err);
const Lb = await mk("lb", "maximo");
eb = await begin(L.H, ll.id);
const seeOwn = await as(L.O, (c) => q(c, "select count(*)::int n from platform_seat_refunds"));
const seeOther = await as(Lb.O, (c) => q(c, "select count(*)::int n from platform_seat_refunds"));
ok("L: cada casa só enxerga os próprios reembolsos (RLS)", seeOwn.rows[0].n === 1 && seeOther.rows[0].n === 0);
const seeFn = await as(Lb.O, (c) => q(c, "select public.my_seat_refunds() r"));
ok("L: my_seat_refunds de outra casa não vaza itens nem histórico", seeFn.rows[0].r.items.length === 0 && seeFn.rows[0].r.history.length === 0);
const mut = await sv("update platform_seat_refunds set amount_cents = 1 where id=$1", [eb.rows[0].r.refund_id]);
ok("L: o valor do reembolso não pode ser alterado", !!mut.err && /não podem ser alterados/.test(mut.err), mut.err);
await done(eb.rows[0].r.refund_id);
const mut2 = await sv("update platform_seat_refunds set status='falhou' where id=$1", [eb.rows[0].r.refund_id]);
const mut3 = await sv("delete from platform_seat_refunds where id=$1", [eb.rows[0].r.refund_id]);
ok("L: reembolso concluído não muda nem apaga", !!mut2.err && !!mut3.err, `${mut2.err} | ${mut3.err}`);
const anonCall = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select public.my_seat_refunds()"); } finally { await c.end(); } })();
ok("L: visitante sem login não consulta", !!anonCall.err, anonCall.err);
// nenhuma fatura de teste ficou com vazamento de texto técnico na notificação
ok("L: nenhuma notificação com texto técnico", await cnt("select count(*)::int n from notifications where text ~* 'pg_|sqlstate|stack|exception|uuid'") === 0);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);
