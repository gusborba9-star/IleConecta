// Verificação LOCAL da rotina de limpeza dos dados de teste (supabase/launch/limpeza_dados_de_teste.sql).
// Uso: node supabase/verify/verify_0128.mjs   (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const cpfOf = (b9) => { const d = b9.split("").map(Number); const dv = (a) => { const s = a.reduce((t, x, i) => t + x * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(d); const d2 = dv([...d, d1]); return [...d, d1, d2].join(""); };
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"]];
const name = "vflimp";
const { c: su, failed } = await freshDb(name, { with64: true, max: 128 });
ok("migrations 0001–0127 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) { try { await su.query(part(f, m)); } catch { /* assinatura antiga */ } }
await su.query("insert into vault.secrets(name, secret) values ('tax_id_key', 'chave-de-teste-sec')");
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
  const O = `b0129000-0000-0000-0000-00000000${hex}`, H = `d0129000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  await sv("select public.tax_id_store($1,$2,$3,true)", [H, cpfOf(String(100000000 + i)), O]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-40,true)", [H, billing]);
  return { O, H };
}
const pay = async (id, amount) => {
  const ref = `cs_limp_${++n}`;
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
const sql = readFileSync(new URL("../launch/limpeza_dados_de_teste.sql", import.meta.url), "utf8");
const block = sql.slice(sql.indexOf("do $limpeza$"), sql.indexOf("$limpeza$;") + "$limpeza$;".length);
ok("script encontrado", block.startsWith("do $limpeza$") && block.endsWith("$limpeza$;"));
const run = (cutoff, execute, text = block, reviews = false) => q(su, text.replace("'2099-01-01 00:00:00+00'", `'${cutoff}'`).replace("v_execute boolean     := false;", `v_execute boolean     := ${execute};`).replace("v_apagar_avaliacoes boolean := false;", `v_apagar_avaliacoes boolean := ${reviews};`));
const T = ["payments","service_orders","ledger_entries","refund_requests","payouts","house_debits","platform_charges","platform_ledger_entries","platform_billing_events","platform_charge_refs","platform_billing_notices","platform_auto_attempts","platform_plan_refunds","platform_seat_refunds","platform_credit_refunds","promo_refunds","promotions","ai_credit_packs","ai_credit_ledger","house_extra_seats"];
const KEEP = ["houses","profiles","house_tax_ids","house_billing_plan","house_billing_state","house_payment_accounts","platform_settings","house_staff","notifications"];
const snap = async (tabs) => { const o = {}; for (const t of tabs) o[t] = Number((await sv(`select count(*)::int n from public.${t}`)).rows[0].n); return o; };
const trgOff = async () => cnt("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgenabled='D'");

// ---------- cenário de teste completo
const CL = `b0129999-0000-0000-0000-0000000000c1`;
await su.query("insert into auth.users(id,email) values ($1,'cliente@x.com')", [CL]);
await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Cliente','Salvador') on conflict (id) do update set account_type='cliente'", [CL]);
const A = await mk("a", "maximo");
const B = await mk("b", "maximo");
for (const X of [A, B]) {
  const planCh = (await sv("select public.platform_charge_issue($1,'plan','plan:maximo',$2::bigint,current_date,current_date,'t',$3) id", [X.H, 28490, `limp-plan-${X.H}`])).rows[0].id;
  await pay(planCh, 28490);
  const s1 = await buySeat(X.H);
  const s2 = await buySeat(X.H);
  const rb = await begin(X.H, s1.id, X.O); await done(rb.rows[0].r.refund_id, "re_limp");      // reembolso de vaga concluído
  await sv("select public.platform_charge_issue($1,'extra_seat','extra_seat',$2::bigint,current_date+7,current_date+7,'Vagas (1)',$3)", [X.H, pMax, `extra_seat:${X.H}:K1`]);
  // pacote de créditos + consumo + reembolso de créditos
  const cp = (await sv("select public.platform_charge_issue($1,'credit_pack','p80',1990::bigint,current_date,current_date,'t',$2) id", [X.H, `limp-cp-${X.H}`])).rows[0].id;
  await pay(cp, 1990);
  const packId = (await sv("select id from ai_credit_packs where charge_id=$1", [cp])).rows[0].id;
  await sv("insert into ai_credit_ledger(house_id,pack_id,usage_id) values ($1,$2,gen_random_uuid())", [X.H, packId]);
  await sv("insert into platform_credit_refunds(charge_id,house_id,pack_id,credits,amount_cents) values ($1,$2,$3,10,300)", [cp, X.H, packId]);
  // destaque + reembolso
  const hl = (await sv("select public.platform_charge_issue($1,'highlight','highlight',5000::bigint,current_date,current_date,'t',$2) id", [X.H, `limp-hl-${X.H}`])).rows[0].id;
  await pay(hl, 5000);
  let pm = await sv("select id from promotions where charge_id=$1", [hl]);
  if (!pm.rows[0]) pm = await sv("insert into promotions(house_id,kind,scope,days,amount_cents,charge_id,authorized_at) values ($1,'highlight','pais',3,5000,$2,now()) returning id", [X.H, hl]);
  await sv("insert into promo_refunds(charge_id,house_id,promotion_id,days_refunded,days_used,prev_days,amount_cents) values ($1,$2,$3,1,1,3,1500)", [hl, X.H, pm.rows[0].id]);
  // pedido de serviço pago + razão + reembolso + débito + repasse
  const ord = (await sv("insert into service_orders(house_id,client_id,title,price_cents,status) values ($1,$2,'Trabalho',10000,'confirmado') returning id", [X.H, CL])).rows[0].id;
  const pid = (await sv("insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',10000,'confirmado','v2-2026-10',1000,now(),'pix') returning id", [ord])).rows[0].id;
  await sv("insert into ledger_entries(payment_id,house_id,entry_type,amount_cents) values ($1,$2,'bruto',9000)", [pid, X.H]);
  const rr = (await sv("insert into refund_requests(payment_id,order_id,house_id,client_id,kind,amount_cents,status,decided_at) values ($1,$2,$3,$4,'antes_do_inicio',10000,'aprovado',now()) returning id", [pid, ord, X.H, CL])).rows[0].id;
  await sv("insert into house_debits(house_id,refund_id,amount_cents) values ($1,$2,500)", [X.H, rr]);
  await sv("insert into payouts(house_id,amount_cents,eligible_at,order_id) values ($1,9000,now(),$2)", [X.H, ord]);
  await sv("insert into platform_auto_attempts(charge_id,attempt,outcome) values ($1,1,'recusada')", [planCh]).then((x) => x.err && console.log("AUTO ERR", x.err));
  const prc = await sv("insert into platform_plan_refunds(charge_id,house_id,amount_cents,status) values ($1,$2,28490,'falhou')", [planCh, X.H]); if (prc.err) console.log("PLANREF ERR", prc.err);
}
await sv("select public.platform_billing_tick(now())");
const before = await snap(T), keepBefore = await snap(KEEP);
ok("cenário montado com dados em todas as tabelas financeiras", T.filter((t) => t !== "house_debits" || true).every((t) => before[t] > 0), JSON.stringify(Object.entries(before).filter(([, v]) => v === 0)));
const FUT = new Date(Date.now() + 3600e3).toISOString();

// ---------- 1) simulação
let r = await run(FUT, false);
ok("simulação termina com o aviso de propósito e as contagens", !!r.err && /^SIMULAÇÃO OK — NADA FOI APAGADO/.test(r.err) && /Permanece \(decisão do dono\)/.test(r.err), r.err);
const sim = (() => { try { return JSON.parse(r.err.match(/Seria apagado: (\{.*?\})\. Permanece/)[1]); } catch { return null; } })();
ok("contagens da simulação batem com o que existe", !!sim && sim.payments === before.payments && sim.service_orders === before.service_orders && sim.platform_charges === before.platform_charges && sim.platform_billing_events === before.platform_billing_events && sim.ledger_entries === before.ledger_entries && sim.platform_ledger_entries === before.platform_ledger_entries && sim.ai_credit_packs === before.ai_credit_packs && sim.promotions === before.promotions && sim.platform_seat_refunds === before.platform_seat_refunds && sim.house_extra_seats === before.house_extra_seats, JSON.stringify([sim, before]));
const afterSim = await snap(T);
ok("simulação NÃO apagou nada", JSON.stringify(afterSim) === JSON.stringify(before), JSON.stringify(afterSim));
ok("simulação não deixou gatilhos desligados", await trgOff() === 0);
ok("simulação informa o que permanece para decisão do dono", /casas_com_plano_pago/.test(r.err) && /casas_com_conta_stripe_de_teste/.test(r.err) && /cpf_cnpj_guardados/.test(r.err));

// ---------- 2) cobrança real depois do corte: aborta
const T0 = new Date().toISOString();
await new Promise((res) => setTimeout(res, 1200));
const realr = await sv("select public.platform_charge_issue($1,'plan','plan:maximo',$2::bigint,current_date+40,current_date+40,'REAL',$3) id", [A.H, 28490, "limp-real-1"]); if (realr.err) console.log("REAL ERR", realr.err);
const real = realr.rows[0].id;
r = await run(T0, true);
ok("execução aborta se existe fatura criada depois do corte", !!r.err && /ABORTADO: platform_charges tem 1 registro/.test(r.err), r.err);
const withReal = await snap(T);
ok("nada foi apagado e as travas seguem ligadas", ["payments","service_orders","ledger_entries","platform_ledger_entries","promotions","ai_credit_packs","platform_seat_refunds"].every((k) => withReal[k] === before[k]) && withReal.platform_charges === before.platform_charges + 1 && await trgOff() === 0, JSON.stringify([withReal, before]));
r = await run(T0, false);
ok("a simulação também denuncia a cobrança real", !!r.err && /ABORTADO/.test(r.err), r.err);
await force("delete from platform_billing_notices where charge_id=$1", [real]);
await force("delete from platform_billing_events where charge_id=$1", [real]);
await force("delete from platform_charges where id=$1", [real]);
const base = await snap(T), keepBase = await snap(KEEP);

// ---------- 3) corte no futuro ao executar
r = await run(new Date(Date.now() + 5 * 3600e3).toISOString(), true);
ok("execução com corte no futuro é recusada", !!r.err && /v_cutoff está no futuro/.test(r.err) && JSON.stringify(await snap(T)) === JSON.stringify(base), r.err);

// ---------- 4) avaliação ligada a pedido de teste: aborta
const ord0 = (await sv("select order_id from payments where order_id is not null limit 1")).rows[0].order_id;
const rv = await sv("insert into reviews(house_id,author_id,service_order_id,rating) select house_id,$2,id,5 from service_orders where id=$1", [ord0, CL]);
ok("(preparo) avaliação criada", !rv.err, rv.err);
r = await run(new Date(Date.now() + 60e3).toISOString(), true);
ok("avaliação de pedido de teste bloqueia a execução (revisão manual)", !!r.err && /avaliação\(ões\) ligada\(s\) a pedidos de teste/.test(r.err) && JSON.stringify(await snap(T)) === JSON.stringify(base), r.err);
r = await run(new Date(Date.now() + 60e3).toISOString(), false);
ok("a simulação NÃO trava por causa da avaliação: só informa quantas são", !!r.err && /^SIMULAÇÃO OK/.test(r.err) && /"avaliacoes_de_pedidos_de_teste": 1/.test(r.err), r.err);

// ---------- 5) execução de verdade
const CUT = new Date(Date.now() + 60e3).toISOString();
r = await run(CUT, true, block, true);
ok("execução real (com a chave das avaliações ligada) conclui sem erro", !r.err, r.err);
ok("a avaliação do pedido de teste foi apagada junto", await cnt("select count(*)::int n from reviews") === 0);
const after = await snap(T);
ok("todas as tabelas financeiras ficaram vazias", Object.entries(after).every(([, v]) => v === 0), JSON.stringify(after));
const keepAfter = await snap(KEEP);
const dn = {}; for (const k of Object.keys(keepBase)) if (keepBase[k] !== keepAfter[k]) dn[k] = [keepBase[k], keepAfter[k]];
ok("casas, usuários, plano, assinatura, CPF/CNPJ, contas de pagamento e configurações ficaram intactos (só notificações novas já existentes seguem)", Object.keys(dn).length === 0, JSON.stringify(dn));
ok("as travas de proteção foram religadas", await trgOff() === 0);
const g = await sv("insert into platform_charges (house_id,kind,item_key,amount_cents,due_date,idempotency_key) values ($1,'plan','plan:maximo',28490,current_date,'limp-after-1') returning id", [A.H]);
const gd = await sv("delete from platform_charges where id=$1", [g.rows?.[0]?.id]);
ok("depois da limpeza a proteção contra apagar fatura volta a valer", !!gd.err && /não pode ser apagada/.test(gd.err), gd.err);
await force("delete from platform_charges where idempotency_key='limp-after-1'");
const ev = await sv("select count(*)::int n from platform_billing_events");
const ev2 = await sv("delete from platform_billing_events");
ok("e a dos eventos financeiros também", !!ev2.err || ev.rows[0].n === 0, ev2.err);
// ---------- 6) repetir é inofensivo; a casa volta a operar
r = await run(CUT, true);
ok("rodar de novo não faz nada e não dá erro", !r.err, r.err);
const A2 = await buySeat(A.H).catch((e) => ({ err: e.message }));
ok("a casa consegue contratar vaga normalmente depois da limpeza", !A2.err && await seatsOf(A.H) === 1, A2.err);
const tk = await sv("select public.platform_billing_tick(now()) r");
ok("a rotina de cobrança roda normalmente depois da limpeza", !tk.err, tk.err);

// ---------- 7) mutação: sem apagar um filho, o banco recusa e NADA é apagado (chaves estrangeiras seguem ligadas)
const C = await mk("c", "maximo");
const cc = await buySeat(C.H);
await sv("insert into house_debits(house_id,refund_id,amount_cents) select $1, id, 100 from (select id from refund_requests limit 1) x", [C.H]);
const ordC = (await sv("insert into service_orders(house_id,client_id,title,price_cents,status) values ($1,$2,'T',100,'confirmado') returning id", [C.H, CL])).rows[0].id;
const pidC = (await sv("insert into payments(order_id,provider,gross_cents,status,fee_rule_version,fee_cents,confirmed_at,payment_method) values ($1,'stripe',100,'confirmado','v2-2026-10',1,now(),'pix') returning id", [ordC])).rows[0].id;
const rrC = (await sv("insert into refund_requests(payment_id,order_id,house_id,client_id,kind,amount_cents,status,decided_at) values ($1,$2,$3,$4,'antes_do_inicio',100,'aprovado',now()) returning id", [pidC, ordC, C.H, CL])).rows[0].id;
await sv("insert into house_debits(house_id,refund_id,amount_cents) values ($1,$2,50)", [C.H, rrC]);
const mutated = block.replace(/  delete from public\.house_debits where refund_id in \(select id from public\.refund_requests\n    where payment_id in \(select id from _lim_pay\) or order_id in \(select order_id from _lim_pay where order_id is not null\)\);\n/, "");
ok("(preparo) mutação aplicada ao script", mutated !== block);
const beforeM = await snap(T);
r = await run(new Date(Date.now() + 60e3).toISOString(), true, mutated);
ok("script mutilado (esquece um filho) é recusado pelo banco por chave estrangeira", !!r.err && /violates foreign key constraint/.test(r.err), r.err);
ok("e nada foi apagado, nem as travas ficaram desligadas", JSON.stringify(await snap(T)) === JSON.stringify(beforeM) && await trgOff() === 0);
r = await run(new Date(Date.now() + 60e3).toISOString(), true);
ok("o script correto limpa esse caso também (inclui o débito da casa)", !r.err && (await snap(T)).house_debits === 0 && (await snap(T)).payments === 0, r.err);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);
