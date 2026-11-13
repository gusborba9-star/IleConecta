// Verificação LOCAL da migration 0088 (motor da cobrança da plataforma): aplica 0001–0088 num PostgreSQL 16 e ataca.
// Uso: node supabase/verify/verify_0088.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0088", { with64: true, max: 88 });
ok("migrations 0001–0088 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(readFileSync(new URL("../migrations/0088_cobranca_motor.sql", import.meta.url), "utf8").split("-- ============ 13) permissões ============")[1]);
const as = async (role, uid, fn) => { const c = await connect("vf0088"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const j = (o) => JSON.stringify(o);
const uid = (k) => `${k}0000000-0000-0000-0000-00000000000${k.length}`.slice(0, 36);
const ADM = "a1000000-0000-0000-0000-0000000000a1", OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2", OWN_C = "b3000000-0000-0000-0000-0000000000b3", CLI = "c1000000-0000-0000-0000-0000000000c1";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2", HC = "d3000000-0000-0000-0000-0000000000d3";
for (const [u, t] of [[ADM, "cliente"], [OWN_A, "casa"], [OWN_B, "casa"], [OWN_C, "casa"], [CLI, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
await su.query("set session_replication_role = replica");
for (const [h, o, p] of [[HA, OWN_A, "intermediario"], [HB, OWN_B, "base"], [HC, OWN_C, "maximo"]]) await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [h, o, "Casa " + p, "casa-" + p, p]);
await su.query("set session_replication_role = origin");
await su.query(`update platform_settings set value = '{"plans":{"base":{"name":"Essencial","monthly":89.9},"intermediario":{"name":"Profissional","monthly":179.9},"maximo":{"name":"Premium","monthly":299.9}},"boost_per_day":{},"highlight_per_day":{}}'::jsonb where key='pricing'`);
const setCfg = (enabled) => su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', $1::jsonb) where key='billing_config'`, [String(enabled)]);
const tick = async (d) => (await q(su, "select public.platform_billing_tick($1::timestamptz) r", [d + "T12:00:00-03:00"])).rows?.[0]?.r;
const state = async (h) => (await q(su, "select suspended from public.house_billing_state where house_id=$1", [h])).rows[0]?.suspended;
const blocked = async (h) => (await q(su, "select public.house_billing_blocked($1) b", [h])).rows[0].b;
const charges = async (h) => (await q(su, "select * from public.platform_charges where house_id=$1 order by kind, due_date", [h])).rows;
const notes = async (o) => (await q(su, "select text from public.notifications where user_id=$1 and href='/planos' order by created_at, text", [o])).rows.map((x) => x.text);

// ---------- 1) cobrança desligada: nada acontece ----------
await q(su, "update platform_settings set value = jsonb_set(value, '{enabled}', 'false') where key='billing_config'");
let r = await tick("2026-11-07"); ok("cobrança desligada: a rotina não faz nada", r?.skipped === "cobranca_desligada", j(r));
r = await q(su, "select public.platform_charge_issue($1,'plan','plan:intermediario',17990,'2026-11-10','2026-11-10','x','idem-desligada-1')", [HA]); ok("cobrança desligada: não emite fatura", !!r.err && /cobranca_desligada/.test(r.err), r.err);
ok("cobrança desligada: ninguém é bloqueado", (await blocked(HA)) === false);

// ---------- 2) matrícula pelo administrador ----------
const adm = (u, sql, p) => as("authenticated", u, (c) => q(c, sql, p));
r = await adm(OWN_A, "select public.admin_billing_enroll($1,10,'matrícula de teste ok')", [HA]); ok("dono da casa não se matricula", !!r.err && /not_admin/.test(r.err), r.err);
r = await adm(ADM, "select public.admin_billing_enroll($1,10,'curto')", [HA]); ok("matrícula exige motivo", !!r.err && /motivo/i.test(r.err), r.err);
for (const d of [0, 29, null]) { r = await adm(ADM, "select public.admin_billing_enroll($1,$2,'matrícula de teste ok')", [HA, d]); ok(`dia de vencimento ${d} recusado`, !!r.err, r.err); }
r = await adm(ADM, "select public.admin_billing_enroll($1,10,'matrícula de teste ok')", ["00000000-0000-0000-0000-000000000000"]); ok("casa inexistente recusada", !!r.err, r.err);
r = await adm(ADM, "select public.admin_billing_enroll($1,10,'matrícula de teste ok')", [HA]); ok("administrador matricula a casa A (dia 10)", !r.err, r.err);
await su.query("update house_billing_plan set started_on = '2026-11-01' where house_id=$1", [HA]);
r = await adm(ADM, "select public.admin_billing_enroll($1,15,'matrícula de teste ok')", [HB]); ok("administrador matricula a casa B", !r.err, r.err);
r = await adm(ADM, "select public.admin_billing_unenroll($1,'saindo do calendário de teste')", [HB]); ok("administrador tira a casa B", !r.err, r.err);
r = await adm(ADM, "select public.admin_billing_unenroll($1,'saindo do calendário de teste')", [HB]); ok("tirar quem já saiu é recusado", !!r.err, r.err);
r = await q(su, "select count(*) n from admin_audit where key in ('billing_enroll','billing_unenroll')"); ok("matrículas ficaram no histórico", Number(r.rows[0].n) === 3, r.rows[0].n);

// ---------- 3) emissão do ciclo ----------
await setCfg(true);
await su.query("insert into house_extra_seats(house_id, seats) values ($1, 2)", [HA]);
r = await tick("2026-11-05"); ok("5/11: ainda fora da janela de 3 dias → nada emitido", r?.issued === 0, j(r));
r = await tick("2026-11-07"); ok("7/11 (3 dias antes do vencimento 10/11): emite plano e vagas", r?.issued === 2, j(r));
let cs = await charges(HA);
const plan = cs.find((x) => x.kind === "plan"), seat = cs.find((x) => x.kind === "extra_seat");
ok("fatura do plano: R$ 179,90 (17990), vence 10/11, período 10/11", plan?.amount_cents === "17990" && String(plan.due_date.toISOString?.().slice(0, 10) ?? plan.due_date).startsWith("2026-11-10") && plan.status === "aberta", j(plan));
ok("fatura das vagas: 2 × R$ 39,90 = 7980", seat?.amount_cents === "7980", j(seat));
ok("casa B (fora do calendário) não recebe nada", (await charges(HB)).length === 0 && (await charges(HC)).length === 0);
r = await tick("2026-11-07"); ok("rodar de novo no mesmo dia não duplica", r?.issued === 0 && (await charges(HA)).length === 2, j(r));
let n1 = await notes(OWN_A); ok("a casa recebe o aviso 'fatura disponível' uma vez por fatura", n1.filter((t) => /disponível/.test(t)).length === 2, j(n1));
r = await q(su, "select count(*) n from platform_charges where house_id=$1 and period_start is not null", [HA]); ok("cada fatura guarda o início do ciclo", r.rows[0].n === "2");

// ---------- 4) avisos e tolerância em dias úteis ----------
await tick("2026-11-09"); n1 = await notes(OWN_A); ok("9/11: aviso de véspera (1 por fatura)", n1.filter((t) => /amanhã/.test(t)).length === 2, j(n1));
await tick("2026-11-10"); n1 = await notes(OWN_A); ok("10/11: aviso do dia do vencimento", n1.filter((t) => /vence hoje/.test(t)).length === 2);
ok("10/11: fatura ainda 'aberta' (vence hoje)", (await charges(HA)).every((x) => x.status === "aberta"));
await tick("2026-11-11"); n1 = await notes(OWN_A);
ok("11/11: fatura 'vencida' e aviso de tolerância citando 13/11 (3 dias úteis)", (await charges(HA)).every((x) => x.status === "vencida") && n1.filter((t) => /tolerância vai até 13\/11/.test(t)).length === 2, j(n1.slice(-3)));
await tick("2026-11-11"); await tick("2026-11-11"); n1 = await notes(OWN_A); ok("repetir a rotina não repete aviso", n1.filter((t) => /tolerância/.test(t)).length === 2 && n1.length === 8, n1.length);
ok("sem multa nem juros: valores seguem iguais", (await charges(HA)).map((x) => x.amount_cents).sort().join() === "17990,7980");
await tick("2026-11-12"); await tick("2026-11-13");
ok("13/11 (3º dia útil após o vencimento): ainda NÃO suspensa", (await state(HA)) !== true && (await blocked(HA)) === false);
await tick("2026-11-14");
ok("14/11: passou a tolerância → suspensa", (await state(HA)) === true && (await blocked(HA)) === true);
r = await q(su, "select count(*) n from platform_billing_events where kind='casa_suspensa'"); ok("a suspensão ficou registrada", r.rows[0].n === "1");
await tick("2026-11-15"); r = await q(su, "select count(*) n from platform_billing_events where kind='casa_suspensa'"); ok("continuar suspensa não registra de novo", r.rows[0].n === "1");
ok("sem selo: nenhuma coluna ou aviso de pontualidade", !(await q(su, "select 1 from information_schema.columns where table_name in ('house_billing_state','platform_charges') and column_name ilike '%selo%'")).rows.length);

// ---------- 5) o que a suspensão bloqueia (e o que não) ----------
await su.query("alter table public.payments drop constraint if exists payments_stripe_no_hold");
for (const t of ["payments", "service_orders", "reservations"]) { for (const { conname } of (await su.query("select conname from pg_constraint where conrelid=$1::regclass and contype='f'", [`public.${t}`])).rows) await su.query(`alter table public.${t} drop constraint ${conname}`); }
const order = async (house) => (await su.query("insert into service_orders(house_id, client_id, title, price_cents) values ($1,$2,'Serviço',10000) returning id", [house, CLI])).rows[0].id;
const pay = (col, id, status = "pendente") => q(su, `insert into payments (${col}, provider, gross_cents, status) values ($1,'stripe',10000,$2)`, [id, status]);
const oNew = await order(HA);
r = await pay("order_id", oNew); ok("casa suspensa: novo pagamento de pedido novo é recusado", !!r.err && /não está recebendo novos pedidos/.test(r.err), r.err);
const oOld = await order(HA);
await su.query("set session_replication_role = replica"); await su.query("insert into payments (order_id, provider, gross_cents, status) values ($1,'stripe',10000,'confirmado')", [oOld]); await su.query("set session_replication_role = origin");
r = await q(su, "insert into payments (order_id, provider, gross_cents, status, stage_no) values ($1,'stripe',10000,'pendente',2)", [oOld]); ok("casa suspensa: o que já estava em andamento (2ª etapa de pedido com pagamento confirmado) continua", !r.err, r.err);
const ev = (await su.query("insert into events(house_id,title,description,price_cents,seats_total,starts_at) values ($1,'Ritual','Ritual de teste com descrição suficientemente longa para a regra',5000,10,now()+interval '10 days') returning id", [HA])).rows[0].id;
const rs = (await su.query("insert into reservations(event_id,user_id) values ($1,$2) returning id", [ev, CLI])).rows[0].id;
r = await pay("reservation_id", rs); ok("casa suspensa: nova reserva paga é recusada", !!r.err, r.err);
const mem = (await su.query("select gen_random_uuid() id")).rows[0].id;
r = await pay("member_due_id", mem); ok("mensalidade de membro NÃO é bloqueada (decisão conservadora: não pune terceiros)", !r.err, r.err);
const oB = await order(HB); r = await pay("order_id", oB); ok("casa em dia (B) segue vendendo", !r.err, r.err);
r = await q(su, "insert into house_campaigns(house_id, code, label) values ($1,'abc','Teste')", [HA]); ok("casa suspensa: nova campanha recusada", !!r.err && /campanhas ficam pausadas/.test(r.err), r.err);
r = await q(su, "insert into house_campaigns(house_id, code, label) values ($1,'abc','Teste')", [HC]); ok("casa em dia: campanha normal (limite do plano segue valendo)", !r.err, r.err);
await setCfg(false); ok("desligar a cobrança libera tudo na hora (chave geral)", (await blocked(HA)) === false);
r = await pay("order_id", await order(HA)); ok("com a cobrança desligada, a casa vende de novo", !r.err, r.err); await setCfg(true);
ok("ligando de novo, o estado da casa continua suspenso", (await blocked(HA)) === true);

n1 = await notes(OWN_A); ok("14/11: aviso de suspensão parcial enviado (1 por fatura)", n1.filter((t) => /suspensão parcial: sem vendas novas/.test(t)).length === 2, j(n1.slice(-3)));
{ const c1 = (await charges(HA))[0]; await q(su, "select public.platform_billing_notice($1,'total_em_breve')", [c1.id]); n1 = await notes(OWN_A);
ok("aviso de bloqueio total cita a data (14/12) e não repete", n1.filter((t) => /bloqueada por completo em 14\/12/.test(t)).length === 1 && !(await q(su, "select public.platform_billing_notice($1,'total_em_breve') r", [c1.id])).rows[0].r, j(n1.slice(-2))); }
// ---------- 5b) bloqueio total: 30 dias depois do início da suspensão parcial ----------
const lvl = async (h) => (await q(su, "select public.house_billing_level($1) l", [h])).rows[0].l;
const rec = async (h, t) => (await q(su, "select public.platform_house_billing_recompute($1,$2) r", [h, t])).rows[0].r;
ok("nível da casa suspensa: parcial", (await lvl(HA)) === "parcial");
ok("nível de casa em dia: ok", (await lvl(HC)) === "ok");
r = await q(su, "select public.billing_total_days() d"); ok("prazo do bloqueio total vale 30 dias quando não configurado", r.rows[0].d === 30, j(r.rows));
await rec(HA, "2026-12-13T12:00:00-03:00"); ok("13/12 (30 dias depois da tolerância): ainda só parcial", (await lvl(HA)) === "parcial");
await rec(HA, "2026-12-14T12:00:00-03:00"); ok("14/12: bloqueio total", (await lvl(HA)) === "total" && (await blocked(HA)) === true);
r = await q(su, "select count(*) n from platform_billing_events where kind='casa_bloqueio_total'"); ok("bloqueio total registrado uma vez", r.rows[0].n === "1");
await rec(HA, "2026-12-15T12:00:00-03:00"); r = await q(su, "select count(*) n from platform_billing_events where kind='casa_bloqueio_total'"); ok("continuar em bloqueio total não registra de novo", r.rows[0].n === "1");
r = await q(su, "select public.platform_billing_config() c"); const cfg0 = r.rows[0].c;
await q(su, "update platform_settings set value = value || '{\"total_block_days\":15}'::jsonb where key='billing_config'");
ok("prazo de bloqueio total configurável (15 dias)", (await q(su, "select public.billing_total_days() d")).rows[0].d === 15);
await q(su, "update platform_settings set value = value || '{\"total_block_days\":3}'::jsonb where key='billing_config'");
ok("prazo inválido (3 dias) é ignorado e vale o padrão de 30", (await q(su, "select public.billing_total_days() d")).rows[0].d === 30);
r = await q(su, "select public.billing_config_ok(public.platform_billing_config() || '{\"total_block_days\":200}'::jsonb) ok"); ok("validação recusa prazo fora de 7 a 90", r.rows[0].ok === false);
await q(su, "update platform_settings set value = $1::jsonb where key='billing_config'", [j(cfg0)]);
await rec(HA, "2026-11-15T12:00:00-03:00"); ok("voltando a data para antes, o nível desce para parcial", (await lvl(HA)) === "parcial");
r = await q(su, "select count(*) n from platform_billing_events where kind='casa_volta_parcial'"); ok("a volta ao parcial ficou registrada", r.rows[0].n === "1");
await q(su, "select public.platform_billing_tick($1)", ["2026-11-15T12:00:00-03:00"]);

// ---------- 6) pagamento em processamento segura a suspensão ----------
const cp = (await charges(HA)).find((x) => x.kind === "plan");
r = await q(su, "select public.platform_charge_attach($1,'stripe','ref-plan-1','pix','https://pay.example/1')", [cp.id]); ok("provedor: guardar referência da cobrança", !r.err, r.err);
r = await q(su, "select public.platform_charge_attach($1,'stripe','OUTRA','pix','https://pay.example/1')", [cp.id]); ok("compare-and-set: referência diferente é recusada", !!r.err && /referencia_ja_definida/.test(r.err), r.err);
r = await q(su, "select public.platform_charge_attach($1,'stripe','ref-plan-1','pix','https://pay.example/1')", [cp.id]); ok("a mesma referência repetida é aceita", !r.err, r.err);
r = await q(su, "select public.platform_charge_attach($1,'stripe','ref-plan-1','boleto','https://x')", [cp.id]); ok("meio inválido recusado", !!r.err, r.err);
r = await q(su, "select public.platform_charge_attach($1,'stripe','ref-x','pix','http://inseguro')", [cp.id]); ok("link de pagamento sem https recusado", !!r.err, r.err);
r = await q(su, "select public.platform_charge_progress('stripe','ref-plan-1','processing','2026-11-15T12:00:00-03:00') s"); ok("pagamento em processamento → fatura 'em_processamento'", r.rows[0]?.s === "em_processamento", j(r));
ok("em processamento: a casa NÃO fica suspensa", (await state(HA)) === false && (await blocked(HA)) === false);
r = await q(su, "select public.platform_charge_progress('stripe','ref-plan-1','failed','2026-11-15T12:00:00-03:00') s"); ok("pagamento falhou → volta a 'vencida'", r.rows[0]?.s === "vencida", j(r));
ok("falhou: a suspensão volta", (await state(HA)) === true);
r = await q(su, "select public.platform_charge_progress('stripe','nao-existe','processing')"); ok("referência desconhecida recusada", !!r.err && /cobranca_desconhecida/.test(r.err), r.err);
r = await q(su, "select public.platform_charge_progress('stripe','ref-plan-1','qualquer')"); ok("estado inválido recusado", !!r.err, r.err);

// ---------- 7) confirmação do pagamento ----------
r = await q(su, "select public.platform_charge_confirm('stripe','ref-plan-1',17000,100)"); ok("valor diferente do da fatura é recusado", !!r.err && /valor_divergente/.test(r.err), r.err);
r = await q(su, "select public.platform_charge_confirm('stripe','ref-plan-1',17990,18000)"); ok("tarifa maior que o valor é recusada", !!r.err && /tarifa_invalida/.test(r.err), r.err);
r = await q(su, "select public.platform_charge_confirm('stripe','ref-plan-1',17990,-1)"); ok("tarifa negativa é recusada", !!r.err, r.err);
r = await q(su, "select public.platform_charge_confirm('outro','ref-plan-1',17990,100)"); ok("provedor diferente não confirma", !!r.err && /cobranca_desconhecida/.test(r.err), r.err);
ok("tentativas recusadas não mudaram nada", (await charges(HA)).find((x) => x.kind === "plan").status === "vencida");
r = await q(su, "select public.platform_charge_confirm('stripe','ref-plan-1',17990,150,'2026-11-15T12:00:00-03:00') r"); ok("confirmação correta", !r.err && r.rows[0].r.already === false, j(r));
cs = await charges(HA); const paid = cs.find((x) => x.kind === "plan");
ok("fatura 'paga' com data, valor pago e tarifa", paid.status === "paga" && paid.paid_at && paid.paid_amount_cents === "17990" && paid.processor_fee_cents === "150", j(paid));
r = await q(su, "select entry_type, amount_cents from platform_ledger_entries where charge_id=$1 order by entry_type", [paid.id]); ok("livro-razão: receita 17990 e tarifa 150", j(r.rows) === j([{ entry_type: "receita", amount_cents: "17990" }, { entry_type: "taxa_provedor", amount_cents: "150" }]), j(r.rows));
r = await q(su, "select public.platform_charge_confirm('stripe','ref-plan-1',17990,150,'2026-11-15T12:00:00-03:00') r"); ok("confirmar de novo não duplica (idempotente)", !r.err && r.rows[0].r.already === true);
r = await q(su, "select count(*) n from platform_ledger_entries where charge_id=$1", [paid.id]); ok("livro-razão segue com 2 lançamentos", r.rows[0].n === "2");
ok("a vaga ainda vencida mantém a casa suspensa (só reativa quando tudo estiver em dia)", (await state(HA)) === true);
await q(su, "select public.platform_charge_attach($1,'stripe','ref-seat-1','card','https://pay.example/2')", [seat.id]);
r = await q(su, "select public.platform_charge_confirm('stripe','ref-seat-1',7980,null,'2026-11-15T12:00:00-03:00') r"); ok("confirmação sem tarifa conhecida", !r.err, r.err);
r = await q(su, "select entry_type from platform_ledger_entries where charge_id=$1", [seat.id]); ok("tarifa desconhecida NÃO vira lançamento zero (fica pendente)", r.rows.length === 1 && r.rows[0].entry_type === "receita", j(r.rows));
ok("tudo pago → a casa é reativada sozinha", (await state(HA)) === false && (await blocked(HA)) === false);
r = await q(su, "select count(*) n from platform_billing_events where kind='casa_reativada'"); ok("as duas reativações (pagamento em processamento e pagamento confirmado) ficaram registradas", r.rows[0].n === "2", r.rows[0].n);
r = await pay("order_id", await order(HA)); ok("depois de pagar, a casa volta a vender", !r.err, r.err);
r = await q(su, "insert into house_campaigns(house_id, code, label) values ($1,'xyz','Teste')", [HA]); ok("e volta a criar campanhas (limite do plano à parte)", !r.err || !/pausadas/.test(r.err), r.err);

// ---------- 8) proteções da fatura e do livro-razão ----------
const mut = [["valor", "update platform_charges set amount_cents=100 where id=$1"], ["vencimento", "update platform_charges set due_date='2030-01-01' where id=$1"], ["casa", `update platform_charges set house_id='${HB}' where id=$1`], ["chave de idempotência", "update platform_charges set idempotency_key='trocada-123456' where id=$1"], ["referência do provedor", "update platform_charges set provider_ref='nova' where id=$1"], ["voltar de paga para aberta", "update platform_charges set status='aberta' where id=$1"], ["apagar fatura", "delete from platform_charges where id=$1"]];
for (const [n, s] of mut) { r = await q(su, s, [paid.id]); ok(`fatura paga: não dá para mudar ${n}`, !!r.err, r.err); }
r = await q(su, "update platform_ledger_entries set amount_cents=1 where charge_id=$1", [paid.id]); ok("livro-razão: não altera", !!r.err && /não pode ser alterado/.test(r.err), r.err);
r = await q(su, "delete from platform_ledger_entries where charge_id=$1", [paid.id]); ok("livro-razão: não apaga", !!r.err, r.err);
r = await q(su, "update platform_billing_events set reason='x'"); ok("eventos: não alteram", !!r.err, r.err);
r = await q(su, "delete from platform_billing_events"); ok("eventos: não apagam", !!r.err, r.err);
r = await q(su, "insert into platform_charges (house_id,kind,item_key,amount_cents,due_date,idempotency_key) values ($1,'plan','x',50,'2026-12-01','idem-valor-baixo')", [HA]); ok("valor abaixo de R$ 1,00 recusado direto na tabela", !!r.err, r.err);
r = await q(su, "insert into platform_charges (house_id,kind,item_key,amount_cents,due_date,idempotency_key) values ($1,'plan','x',5000,'2026-12-01','curta')", [HA]); ok("chave de idempotência curta recusada", !!r.err, r.err);
r = await q(su, "insert into platform_charges (house_id,kind,item_key,amount_cents,due_date,status,idempotency_key) values ($1,'plan','x',5000,'2026-12-01','paga','idem-paga-sem-data')", [HA]); ok("fatura 'paga' sem data de pagamento recusada", !!r.err, r.err);

// ---------- 9) idempotência e validação de emissão ----------
const issue = (...a) => q(su, "select public.platform_charge_issue($1,$2,$3,$4,$5,$6,$7,$8,$9) id", a);
const base = [HC, "credit_pack", "credit_pack:p80", 1990, "2026-12-01", null, "Pacote 80", "idem-pacote-0001", null];
r = await issue(...base); const id1 = r.rows?.[0]?.id; ok("emite fatura avulsa (pacote)", !r.err && !!id1, r.err);
r = await issue(...base); ok("mesma chave e mesmos dados → mesma fatura", r.rows?.[0]?.id === id1, j(r));
r = await issue(...base.map((v, i) => (i === 3 ? 2990 : v))); ok("mesma chave com valor diferente é recusada", !!r.err && /idempotencia_conflitante/.test(r.err), r.err);
r = await issue(...base.map((v, i) => (i === 1 ? "x" : i === 7 ? "idem-outra-0002" : v))); ok("tipo inválido recusado", !!r.err, r.err);
for (const a of [50, 5000001, null]) { r = await issue(...base.map((v, i) => (i === 3 ? a : i === 7 ? "idem-v-" + a : v))); ok(`valor ${a} recusado`, !!r.err, r.err); }
r = await issue(...base.map((v, i) => (i === 4 ? "2090-01-01" : i === 7 ? "idem-data-0003" : v))); ok("vencimento absurdo recusado", !!r.err, r.err);
r = await issue(...base.map((v, i) => (i === 0 ? "00000000-0000-0000-0000-000000000000" : i === 7 ? "idem-casa-0004" : v))); ok("casa inexistente recusada", !!r.err, r.err);
r = await issue(...base.map((v, i) => (i === 7 ? "curta" : v))); ok("chave curta recusada", !!r.err, r.err);
const pend = (await charges(HC)).find((x) => x.kind === "credit_pack");
r = await q(su, "select public.platform_charge_attach($1,'stripe','ref-dup-1','card','https://x.example')", [pend.id]);
r = await issue(...base.map((v, i) => (i === 2 ? "credit_pack:p200" : i === 3 ? 4990 : i === 7 ? "idem-pacote-0005" : v)));
const id2 = r.rows?.[0]?.id; r = await q(su, "select public.platform_charge_attach($1,'stripe','ref-dup-1','card','https://x.example')", [id2]); ok("a mesma referência do provedor não vale para duas faturas", !!r.err, r.err);

// ---------- 10) cancelamento ----------
r = await adm(OWN_C, "select public.platform_charge_cancel($1,'cancelamento de teste ok')", [id2]); ok("dono da casa não cancela", !!r.err && /not_admin/.test(r.err), r.err);
r = await adm(ADM, "select public.platform_charge_cancel($1,'curto')", [id2]); ok("cancelamento exige motivo", !!r.err, r.err);
r = await adm(ADM, "select public.platform_charge_cancel($1,'cancelamento de teste ok')", [id2]); ok("administrador cancela fatura em aberto", !r.err, r.err);
r = await adm(ADM, "select public.platform_charge_cancel($1,'cancelamento de teste ok')", [id2]); ok("não cancela duas vezes", !!r.err, r.err);
r = await adm(ADM, "select public.platform_charge_cancel($1,'cancelamento de teste ok')", [paid.id]); ok("não cancela fatura paga", !!r.err, r.err);
r = await q(su, "select count(*) n from admin_audit where key='billing_cancel'"); ok("cancelamento ficou no histórico", r.rows[0].n === "1");
r = await q(su, "select public.platform_charge_confirm('stripe','ref-dup-1',4990,null)"); ok("fatura cancelada não pode ser paga", !!r.err, r.err);

// ---------- 11) emissão tardia, uma casa nova e boost ----------
await adm(ADM, "select public.admin_billing_enroll($1,10,'matrícula de teste ok')", [HC]);
await su.query("update house_billing_plan set started_on = '2026-10-01' where house_id=$1", [HC]);
r = await tick("2026-11-12"); const late = (await charges(HC)).filter((x) => x.kind === "plan");
ok("emissão atrasada: vencimento ajustado para ter o aviso mínimo (12/11 + 3 = 15/11), ciclo de 10/11", late.length >= 1 && late.some((x) => String(x.due_date.toISOString?.().slice(0, 10)) === "2026-11-15" && String(x.period_start.toISOString?.().slice(0, 10)) === "2026-11-10"), j(late.map((x) => [x.due_date, x.period_start])));
ok("Premium cobra R$ 299,90", late.some((x) => x.amount_cents === "29990"));
const bo = (await su.query("insert into boosts(house_id,kind,scope,days,price_cents,paid) values ($1,'impulsionamento','local',3,5970,false) returning id", [HC])).rows[0].id;
const bo2 = (await su.query("insert into boosts(house_id,kind,scope,days,price_cents,paid) values ($1,'impulsionamento','local',3,5970,false) returning id", [HA])).rows[0].id;
await issue(HC, "boost", "boost:" + bo, 5970, "2026-12-01", null, "Impulsionamento", "idem-boost-0001", bo);
await q(su, "select public.platform_charge_attach((select id from platform_charges where idempotency_key='idem-boost-0001'),'stripe','ref-boost-1','pix','https://x.example')");
await q(su, "select public.platform_charge_confirm('stripe','ref-boost-1',5970,null)");
r = await q(su, "select id, paid from boosts where id in ($1,$2)", [bo, bo2]); ok("pagar o impulsionamento libera só o impulsionamento da própria casa", r.rows.find((x) => x.id === bo).paid === true && r.rows.find((x) => x.id === bo2).paid === false, j(r.rows));
await issue(HA, "boost", "boost:" + bo2, 5970, "2026-12-01", null, "Impulsionamento", "idem-boost-0002", bo);
await q(su, "select public.platform_charge_attach((select id from platform_charges where idempotency_key='idem-boost-0002'),'stripe','ref-boost-2','pix','https://x.example')");
await q(su, "select public.platform_charge_confirm('stripe','ref-boost-2',5970,null)");
r = await q(su, "select id, paid from boosts where id = $1", [bo2]); ok("fatura com referência de outra casa não libera o impulsionamento alheio", r.rows[0].paid === false, j(r.rows));

// ---------- 12) leitura (RLS), permissões e retenção ----------
const cnt = (u, t) => as("authenticated", u, (c) => q(c, `select count(*) n from public.${t}`)).then((x) => Number(x.rows?.[0]?.n ?? -1));
ok("dono A vê só as próprias faturas", (await cnt(OWN_A, "platform_charges")) === (await charges(HA)).length);
ok("dono B (sem faturas) não vê as dos outros", (await cnt(OWN_B, "platform_charges")) === 0);
ok("cliente não vê faturas", (await cnt(CLI, "platform_charges")) === 0);
ok("administrador vê todas", (await cnt(ADM, "platform_charges")) >= 6);
for (const t of ["platform_ledger_entries", "platform_billing_events"]) { ok(`${t}: dono da casa não lê`, (await cnt(OWN_A, t)) === 0); ok(`${t}: administrador lê`, (await cnt(ADM, t)) > 0); }
ok("avisos: dono vê os da própria casa", (await cnt(OWN_A, "platform_billing_notices")) > 0 && (await cnt(OWN_B, "platform_billing_notices")) === 0);
ok("estado de suspensão: dono lê o da própria casa", (await cnt(OWN_A, "house_billing_state")) === 1 && (await cnt(OWN_B, "house_billing_state")) === 0);
for (const s of ["insert into platform_charges (house_id,kind,item_key,amount_cents,due_date,idempotency_key) values ('" + HA + "','plan','x',5000,'2026-12-01','idem-direto-0001')", "update platform_charges set status='paga'", "insert into platform_ledger_entries(charge_id,house_id,entry_type,amount_cents) select id,house_id,'receita',100 from platform_charges limit 1", "update house_billing_state set suspended=false", "insert into house_billing_plan(house_id,billing_day,started_on) values ('" + HB + "',5,now())"]) {
  r = await adm(ADM, s); ok(`nem o administrador grava direto: ${s.slice(0, 48)}`, !!r.err, r.err);
  r = await adm(OWN_A, s); ok(`nem o dono grava direto: ${s.slice(0, 48)}`, !!r.err, r.err);
}
r = await as("anon", null, (c) => q(c, "select count(*) from public.platform_charges")); ok("anon não lê faturas", !!r.err, r.err);
const hasFn = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
for (const sig of ["platform_billing_tick(timestamptz)", "platform_charge_confirm(text,text,bigint,bigint,timestamptz)", "platform_charge_issue(uuid,text,text,bigint,date,date,text,text,uuid)", "platform_charge_attach(uuid,text,text,text,text)", "platform_charge_progress(text,text,text,timestamptz)", "platform_house_billing_recompute(uuid,timestamptz)", "house_billing_blocked(uuid)", "house_billing_level(uuid)", "billing_total_days()", "platform_billing_notice(uuid,text)"]) {
  ok(`anon não executa ${sig}`, !(await hasFn("anon", "public." + sig))); ok(`authenticated não executa ${sig}`, !(await hasFn("authenticated", "public." + sig))); ok(`service_role executa ${sig}`, await hasFn("service_role", "public." + sig));
}
for (const sig of ["admin_billing_enroll(uuid,int,text)", "admin_billing_unenroll(uuid,text)", "platform_charge_cancel(uuid,text)"]) { ok(`anon não executa ${sig}`, !(await hasFn("anon", "public." + sig))); ok(`authenticated executa ${sig} (com trava interna)`, await hasFn("authenticated", "public." + sig)); }
r = await as("authenticated", OWN_A, (c) => q(c, "select public.platform_billing_tick()")); ok("dono da casa não roda a rotina de cobrança", !!r.err, r.err);
r = await as("authenticated", OWN_A, (c) => q(c, "select public.platform_charge_confirm('stripe','ref-dup-1',1,null)")); ok("dono da casa não confirma pagamento", !!r.err, r.err);
const before = Number((await q(su, "select count(*) n from platform_charges")).rows[0].n);
await su.query("delete from houses where id=$1", [HC]);
ok("excluir a casa mantém as faturas e o livro-razão (retenção)", Number((await q(su, "select count(*) n from platform_charges")).rows[0].n) === before && Number((await q(su, "select count(*) n from platform_ledger_entries where house_id=$1", [HC])).rows[0].n) >= 1);
ok("excluir a casa limpa matrícula e estado", (await q(su, "select count(*) n from house_billing_plan where house_id=$1", [HC])).rows[0].n === "0");
r = await tick("2026-12-10"); ok("a rotina segue funcionando depois da exclusão de uma casa", !!r && !r.skipped && !r.err, j(r));
ok("faturas abertas de casa excluída são canceladas (não envelhecem nem avisam)", (await q(su, "select count(*) n from platform_charges where house_id=$1 and status in ('aberta','vencida')", [HC])).rows[0].n === "0");
ok("nenhum erro registrado pela rotina", (await q(su, "select count(*) n from platform_billing_events where outcome='rejeitado'")).rows[0].n === "0");

// ---------- 12) simulação de 3 meses: casa que atrasa sempre e só paga a fatura mais antiga no limite do bloqueio total ----------
{
  const OWN_D = "b4000000-0000-0000-0000-0000000000b4", HD = "d4000000-0000-0000-0000-0000000000d4";
  await su.query("insert into auth.users(id,email) values ($1,$2)", [OWN_D, OWN_D + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa Teste','Salvador') on conflict (id) do update set account_type='casa'", [OWN_D]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Atrasada','casa-atrasada','base')", [HD, OWN_D]);
  await adm(ADM, "select public.admin_billing_enroll($1,20,'simulação de atraso crônico')", [HD]);
  await su.query("update house_billing_plan set started_on = '2026-08-01' where house_id=$1", [HD]);
  const lv = async () => (await q(su, "select public.house_billing_level($1) l", [HD])).rows[0].l;
  const days = { ok: 0, parcial: 0, total: 0 }; let paidInvoices = 0, issuedTotal = 0, ref = 0;
  const start = new Date("2026-09-01T12:00:00-03:00");
  for (let i = 0; i < 120; i++) {
    const dt = new Date(start.getTime() + i * 86400000), ds = dt.toISOString().slice(0, 10);
    const t = await tick(ds); issuedTotal += t?.issued ?? 0;
    const l = await lv(); days[l]++;
    if (l === "total") {
      const open = (await q(su, "select id, amount_cents from platform_charges where house_id=$1 and status in ('aberta','vencida') order by due_date, created_at limit 1", [HD])).rows[0];
      if (open) { ref++; await q(su, "select public.platform_charge_attach($1,'stripe',$2,'card','https://pay.example/x')", [open.id, "sim-" + ref]);
        await q(su, "select public.platform_charge_confirm('stripe',$1,$2,null,$3::timestamptz)", ["sim-" + ref, open.amount_cents, dt.toISOString()]); paidInvoices++; }
    }
  }
  ok(`simulação de 120 dias: dias ok=${days.ok}, parcial=${days.parcial}, total=${days.total}; faturas emitidas=${issuedTotal}, pagas=${paidInvoices}`, true);
  ok("quem atrasa sempre passa quase todo o tempo SEM poder vender (mais de 80% em parcial/total)", (days.parcial + days.total) / 120 > 0.8, j(days));
  ok("pagar só a fatura mais antiga não devolve o uso normal enquanto houver outra em aberto", days.ok <= 12, j(days));
  ok("a rotina não gerou erro durante a simulação", (await q(su, "select count(*) n from platform_billing_events where outcome='rejeitado'")).rows[0].n === "0");
}
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
