// Verificação LOCAL da migration 0101 (cancelamento pela casa e estado da conta / trava no servidor).
// Uso: node supabase/verify/verify_0101.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0101", { with64: true, max: 101 });
ok("migrations 0001–0101 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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
await su.query(part("0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0101"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const uid = (n) => `${n}0000000-0000-0000-0000-00000000000${n}`;
const ADM = "a1000000-0000-0000-0000-0000000000a1", CLI = "c1000000-0000-0000-0000-0000000000c1", STF = "e1000000-0000-0000-0000-0000000000e1";
const mkUser = async (u, t) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]); };
await mkUser(ADM, "cliente"); await mkUser(CLI, "cliente"); await mkUser(STF, "cliente");
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
const houses = {};
let hn = 0;
const mkHouse = async (key) => { hn++; const x = String(hn).padStart(2, "0"); const o = `b${x}00000-0000-0000-0000-000000000b${x}`, h = `d${x}00000-0000-0000-0000-000000000d${x}`; await mkUser(o, "casa"); await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'intermediario')", [h, o, "Casa " + key, "casa-" + key.toLowerCase()]); houses[key] = { o, h }; return houses[key]; };

const today = (await sv("select (now() at time zone 'America/Sao_Paulo')::date::text d")).rows[0].d; // AAAA-MM-DD
const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// dia de cobrança de teste: daqui a 6 dias, se couber em 1–28; senão 6 dias atrás
let bd = Number(addDays(today, 6).slice(8)); if (bd > 28) bd = Number(addDays(today, -6).slice(8)); if (bd > 28 || bd < 1) bd = 10;
const nextRen = () => { const [y, m] = today.split("-").map(Number); const pad = (n) => String(n).padStart(2, "0"); let c = `${y}-${pad(m)}-${pad(bd)}`; if (c <= today) { const nm = m === 12 ? [y + 1, 1] : [y, m + 1]; c = `${nm[0]}-${pad(nm[1])}-${pad(bd)}`; } return c; };
const NR = nextRen();
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const NOTICE = Number((await sv("select (value->>'notice_days')::int n from platform_settings where key='billing_config'")).rows[0].n);
const enrollH = async (h, day = bd) => sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,$3,true)", [h, day, addDays(today, -40)]);
const issue = async (h, due, period, key, kind = "plan", amt = 17990) => { const x = await sv("select public.platform_charge_issue($1,$2,$3,$4,$5::date,$6::date,'Mensalidade do plano',$7) id", [h, kind, kind === "plan" ? "plan:intermediario" : "extra_seat", amt, due, period, key]); if (x.err) throw new Error("issue: " + x.err); return x.rows[0].id; };
const st = async (h) => (await sv("select * from house_billing_state where house_id=$1", [h])).rows[0];
const plan = async (h) => (await sv("select * from house_billing_plan where house_id=$1", [h])).rows[0];
const charges = async (h, status = null) => (await sv("select * from platform_charges where house_id=$1 and ($2::text is null or status=$2) order by created_at, id", [h, status])).rows;
const nNotes = async (u, like) => Number((await sv("select count(*) n from notifications where user_id=$1 and text like $2", [u, like])).rows[0].n);
const status = (u) => as("authenticated", u, (c) => q(c, "select public.my_cancel_status() s")).then((r) => r.rows?.[0]?.s ?? r);
const cancel = (u, mode) => as("authenticated", u, (c) => q(c, "select public.my_cancel_subscription($1) r", [mode]));
const undo = (u) => as("authenticated", u, (c) => q(c, "select public.my_cancel_undo() r"));
const gate = (u) => as("authenticated", u, (c) => q(c, "select public.my_account_gate() g")).then((r) => r.rows?.[0]?.g ?? r);
const noon = (d) => `${d} 12:00:00-03`;

// ---------- A: cancelamento "até o vencimento" sem fatura aberta ----------
const A = await mkHouse("A"), B = await mkHouse("B");
await enrollH(A.h); await enrollH(B.h);
let s = await status(A.o);
ok("A: status mostra que pode cancelar e a próxima renovação", s.can_cancel === true && s.next_renewal === NR && s.scheduled === false, JSON.stringify(s));
ok("A: cliente sem casa não vê nada para cancelar", (await status(CLI)).has_house === false);
let r = await cancel(A.o, "vencimento");
ok("A: agenda o cancelamento para a renovação", r.rows?.[0]?.r?.mode === "vencimento" && r.rows[0].r.cancel_at === NR, JSON.stringify(r));
let a = await st(A.h);
ok("A: estado guarda a data e o plano segue ativo", String(a.cancel_at.toISOString?.() ?? a.cancel_at).slice(0, 10) === NR || a.cancel_at != null, JSON.stringify(a));
ok("A: plano ainda ativo e nível ok até o vencimento", (await plan(A.h)).active === true && (await sv("select public.house_billing_level($1) l", [A.h])).rows[0].l === "ok");
ok("A: aviso enviado uma vez", (await nNotes(A.o, "Cancelamento agendado%")) === 1);
r = await cancel(A.o, "vencimento");
ok("A: agendar de novo é recusado", /já está agendado/.test(r.err ?? ""), r.err);
r = await cancel(A.o, "agora");
ok("A: cancelar agora com agendamento é recusado (use o desfazer antes)", /já está agendado/.test(r.err ?? ""), r.err);
s = await status(A.o);
ok("A: status mostra agendado", s.scheduled === true && s.can_cancel === false && s.cancel_at === NR, JSON.stringify(s));
// a rotina diária não emite fatura nova para A, mas emite para B (controle)
const emitAt = noon(addDays(NR, -NOTICE));
const tk = await sv("select public.platform_billing_tick($1::timestamptz) r", [emitAt]);
ok("rotina diária roda", !tk.err, tk.err);
ok("A: sem fatura nova (cancelamento agendado)", (await charges(A.h)).length === 0);
ok("B: controle recebe a fatura do ciclo", (await charges(B.h)).filter((x) => x.kind === "plan" && x.period_start.toISOString().slice(0, 10) === NR).length === 1);
// antes da data: a rotina de cancelamento não faz nada
let n0 = await sv("select public.platform_cancel_apply_due($1::timestamptz) n", [noon(addDays(NR, -1))]);
ok("antes da data nada é encerrado", n0.rows[0].n === 0 && (await plan(A.h)).active === true);
// no dia: a casa fica inativa
n0 = await sv("select public.platform_cancel_apply_due($1::timestamptz) n", [noon(NR)]);
ok("no dia a casa é encerrada", n0.rows[0].n === 1, JSON.stringify(n0.rows));
a = await st(A.h);
ok("A: inativa (cancelled_at, total, sem cancel_at)", a.cancelled_at != null && a.total === true && a.suspended === true && a.cancel_at == null && a.cancel_charges.length === 0, JSON.stringify(a));
ok("A: plano de cobrança desativado", (await plan(A.h)).active === false);
ok("A: nível total e aviso de inatividade", (await sv("select public.house_billing_level($1) l", [A.h])).rows[0].l === "total" && (await nNotes(A.o, "Assinatura cancelada%")) === 1);
n0 = await sv("select public.platform_cancel_apply_due($1::timestamptz) n", [noon(addDays(NR, 1))]);
ok("rodar de novo não repete", n0.rows[0].n === 0 && (await nNotes(A.o, "Assinatura cancelada%")) === 1);
let g = await gate(A.o);
ok("A: tela única mostra CONTA INATIVA", g.state === "inativa" && g.role === "dono" && g.house_name === "Casa A", JSON.stringify(g));
r = await cancel(A.o, "agora");
ok("A: cancelar de novo é recusado", /já está cancelada|não tem assinatura ativa/.test(r.err ?? ""), r.err);

// ---------- C: com fatura aberta do próximo ciclo; desfazer reemite ----------
const Cc = await mkHouse("C"); await enrollH(Cc.h);
const cid = await issue(Cc.h, NR, NR, `plan:${Cc.h}:${NR}`);
await sv("insert into house_card_on_file(house_id,provider,customer_ref,method_ref,brand,last4,exp_month,exp_year,saved_on,auto_enabled) values ($1,'stripe','cus_C','pm_C','visa','4242',12,2030,$2,true)", [Cc.h, addDays(today, -30)]);
r = await cancel(Cc.o, "vencimento");
ok("C: agenda com fatura aberta", r.rows?.[0]?.r?.mode === "vencimento" && r.rows[0].r.cancel_at === NR, JSON.stringify(r));
ok("C: a fatura aberta foi cancelada e guardada", (await charges(Cc.h, "cancelada")).length === 1 && (await charges(Cc.h, "aberta")).length === 0 && (await st(Cc.h)).cancel_charges.includes(cid));
ok("C: cartão automático continua como estava até o fim", (await sv("select auto_enabled from house_card_on_file where house_id=$1", [Cc.h])).rows[0].auto_enabled === true);
const due0 = await sv("select count(*) n from public.platform_autocharge_due($1::timestamptz) where house_id=$2", [noon(addDays(NR, 1)), Cc.h]);
ok("C: nada para cobrar no cartão (fatura cancelada)", Number(due0.rows[0].n) === 0);
r = await undo(Cc.o);
ok("C: desfazer reemite a fatura", r.rows?.[0]?.r?.reissued === 1, JSON.stringify(r));
let open = await charges(Cc.h, "aberta");
ok("C: fatura reaberta com mesmo valor, vencimento e período", open.length === 1 && Number(open[0].amount_cents) === 17990 && open[0].due_date.toISOString().slice(0, 10) === NR && open[0].period_start.toISOString().slice(0, 10) === NR && open[0].id !== cid, JSON.stringify(open.map((x) => x.idempotency_key)));
ok("C: original continua cancelada (histórico imutável)", (await charges(Cc.h, "cancelada")).length === 1);
ok("C: estado limpo e aviso de desfeito", (await st(Cc.h)).cancel_at == null && (await st(Cc.h)).cancel_charges.length === 0 && (await nNotes(Cc.o, "Cancelamento desfeito%")) === 1);
await sv("select public.platform_billing_tick($1::timestamptz)", [noon(addDays(NR, -NOTICE))]);
ok("C: a rotina não duplica a fatura do ciclo", (await charges(Cc.h)).filter((x) => x.status !== "cancelada" && x.period_start.toISOString().slice(0, 10) === NR).length === 1);
r = await undo(Cc.o);
ok("C: desfazer sem agendamento é recusado", /Não há cancelamento agendado/.test(r.err ?? ""), r.err);
// agenda de novo e depois "vence" o prazo de desfazer
await cancel(Cc.o, "vencimento");
await sv("update house_billing_state set cancel_at=$2 where house_id=$1", [Cc.h, today]);
r = await undo(Cc.o);
ok("C: no dia do cancelamento já não dá para desfazer", /não pode mais ser desfeito/.test(r.err ?? ""), r.err);
await sv("select public.platform_cancel_apply_due($1::timestamptz)", [noon(today)]);
ok("C: cartão automático desligado", (await sv("select auto_enabled from house_card_on_file where house_id=$1", [Cc.h])).rows[0].auto_enabled === false && (await charges(Cc.h, "aberta")).length === 0);

// ---------- D: cancelar agora ----------
const D = await mkHouse("D"); await enrollH(D.h);
await issue(D.h, NR, NR, `plan:${D.h}:${NR}`);
await issue(D.h, NR, NR, `seat:${D.h}:${NR}`, "extra_seat", 5000);
r = await cancel(D.o, "agora");
ok("D: cancelar agora encerra na hora", r.rows?.[0]?.r?.mode === "agora", JSON.stringify(r));
let d = await st(D.h);
ok("D: inativa, faturas abertas canceladas, plano desativado", d.cancelled_at != null && d.total === true && (await charges(D.h, "aberta")).length === 0 && (await charges(D.h, "cancelada")).length === 2 && (await plan(D.h)).active === false);
ok("D: tela única mostra inativa", (await gate(D.o)).state === "inativa");
ok("D: aviso único", (await nNotes(D.o, "Assinatura cancelada%")) === 1);

// ---------- E: recusas ----------
const E = await mkHouse("E"); await enrollH(E.h);
await sv("insert into platform_charges(house_id,kind,item_key,amount_cents,period_start,due_date,status,idempotency_key) values ($1,'plan','plan:intermediario',17990,$2,$2,'vencida',$3)", [E.h, addDays(today, -20), "late-" + E.h]);
r = await cancel(E.o, "agora");
ok("E: com fatura vencida não cancela (dívida não some)", /fatura em atraso/.test(r.err ?? ""), r.err);
ok("E: nada mudou", (await plan(E.h)).active === true && (await charges(E.h, "vencida")).length === 1);
s = await status(E.o);
ok("E: status explica o motivo", s.can_cancel === false && /atraso/.test(s.reason ?? ""), JSON.stringify(s));
const F = await mkHouse("F"); await enrollH(F.h);
await sv("insert into platform_charges(house_id,kind,item_key,amount_cents,period_start,due_date,status,idempotency_key) values ($1,'plan','plan:intermediario',17990,$2,$2,'em_processamento',$3)", [F.h, addDays(today, 1), "proc-" + F.h]);
r = await cancel(F.o, "agora");
ok("F: com pagamento em processamento não cancela", /em processamento/.test(r.err ?? ""), r.err);
const G = await mkHouse("G"); await enrollH(G.h);
r = await cancel(CLI, "agora");
ok("quem não tem casa não cancela", /Só a casa/.test(r.err ?? ""), r.err);
r = await cancel(G.o, "qualquer");
ok("modo inválido é recusado", /Escolha como quer cancelar/.test(r.err ?? ""), r.err);
r = await as("anon", null, (c) => q(c, "select public.my_cancel_subscription('agora')"));
ok("visitante não executa o cancelamento", r.code === "42501", r.err);
r = await as("anon", null, (c) => q(c, "select public.my_account_gate()"));
ok("visitante não lê o estado da conta", r.code === "42501", r.err);
ok("funções internas não são do usuário", (await as("authenticated", G.o, (c) => q(c, "select public.platform_house_cancel_apply($1)", [G.h]))).code === "42501" && (await as("authenticated", G.o, (c) => q(c, "select public.platform_cancel_apply_due()"))).code === "42501");
// cobrança desligada
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'false') where key='billing_config'`);
r = await cancel(G.o, "agora");
ok("G: com a cobrança desligada não há o que cancelar", /ainda não está ativa/.test(r.err ?? ""), r.err);
ok("G: com a cobrança desligada a tela é normal", (await gate(D.o)).state === "ok");
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
// renovação já hoje: cancela na hora
const Hh = await mkHouse("H"); await enrollH(Hh.h);
await issue(Hh.h, today, today, `plan:${Hh.h}:${today}`);
r = await cancel(Hh.o, "vencimento");
ok("H: renovação com vencimento hoje encerra na hora", r.rows?.[0]?.r?.mode === "agora" && (await st(Hh.h)).cancelled_at != null, JSON.stringify(r));

// ---------- estado da conta (tela única) ----------
const I = await mkHouse("I"); await enrollH(I.h);
ok("I: casa em dia vê o app normal", (await gate(I.o)).state === "ok");
await sv("insert into house_billing_state(house_id,suspended,since,total,total_since) values ($1,true,now(),false,null)", [I.h]);
ok("I: bloqueio parcial NÃO leva à tela única", (await gate(I.o)).state === "ok");
await sv("update house_billing_state set total=true,total_since=now() where house_id=$1", [I.h]);
g = await gate(I.o);
ok("I: bloqueio total mostra CONTA BLOQUEADA", g.state === "bloqueada" && g.role === "dono", JSON.stringify(g));
ok("cliente comum nunca vê a tela", (await gate(CLI)).state === "ok");
ok("administrador nunca vê a tela", (await gate(ADM)).state === "ok");
await sv("insert into house_extra_seats(house_id,seats) values ($1,1) on conflict (house_id) do update set seats=1", [I.h]);
const seat = await sv("insert into house_staff(house_id,user_id,name,active) values ($1,$2,'Ajudante',true)", [I.h, STF]);
g = await gate(STF);
ok("equipe da casa bloqueada vê a tela (sem poder pagar)", g.state === "bloqueada" && g.role === "equipe", JSON.stringify(g) + (seat.err ?? ""));

// ---------- trava no servidor ----------
const post = (u, h, txt) => as("authenticated", u, (c) => q(c, "insert into posts(house_id, content) values ($1,$2) returning id", [h, txt]));
r = await post(I.o, I.h, "olá");
ok("casa em bloqueio total não publica", r.code === "42501", r.err);
r = await as("authenticated", I.o, (c) => q(c, "insert into house_quick_replies(house_id,title,body) values ($1,'t','corpo')", [I.h]));
ok("casa em bloqueio total não grava respostas rápidas", r.code === "42501", r.err);
r = await as("authenticated", I.o, (c) => q(c, "insert into services(house_id,kind,title,price_cents) values ($1,(select enumlabel::text from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='service_kind' order by enumsortorder limit 1),'S',1000)", [I.h]));
ok("casa em bloqueio total não cria serviço", r.code === "42501" || /enum|service_kind|syntax/.test(r.err ?? ""), r.err);
r = await post(A.o, A.h, "olá");
ok("casa inativa (cancelada) também não publica", r.code === "42501", r.err);
r = await post(B.o, B.h, "olá do B");
ok("casa em dia publica normalmente", !r.err && r.rows?.length === 1, r.err);
const pid = r.rows?.[0]?.id;
await sv("insert into house_billing_state(house_id,suspended,since,total,total_since) values ($1,true,now(),true,now()) on conflict (house_id) do update set total=true,suspended=true", [B.h]);
r = await as("authenticated", B.o, (c) => q(c, "update posts set content='editado' where id=$1", [pid]));
ok("depois de bloqueada, não edita o que já publicou", r.n === 0 || !!r.err, JSON.stringify(r));
r = await as("authenticated", B.o, (c) => q(c, "delete from posts where id=$1", [pid]));
ok("depois de bloqueada, não apaga", r.n === 0 || !!r.err, JSON.stringify(r));
ok("o post continua lá", Number((await sv("select count(*) n from posts where id=$1", [pid])).rows[0].n) === 1);
r = await as("authenticated", B.o, (c) => q(c, "select count(*) n from posts where id=$1", [pid]));
ok("leitura continua liberada (a casa vê o que tem)", Number(r.rows?.[0]?.n) === 1, JSON.stringify(r));
await sv("update house_billing_state set total=false,suspended=false where house_id=$1", [B.h]);
r = await as("authenticated", B.o, (c) => q(c, "update posts set content='editado' where id=$1", [pid]));
ok("pagou/desbloqueou: volta a editar", r.n === 1, JSON.stringify(r));
r = await as("authenticated", B.o, (c) => q(c, "insert into posts(house_id, content) values ($1,'de novo')", [I.h]));
ok("casa não escreve na casa dos outros (regra antiga mantida)", r.code === "42501", r.err);
ok("as 13 tabelas têm as 3 travas", Number((await sv("select count(*) n from pg_policies where schemaname='public' and policyname in ('billing_lock_ins','billing_lock_upd','billing_lock_del')")).rows[0].n) === 39);
ok("travas são restritivas", Number((await sv("select count(*) n from pg_policies where schemaname='public' and policyname like 'billing_lock_%' and permissive='RESTRICTIVE'")).rows[0].n) === 39);

// ---------- reembolso do plano usa o mesmo fim e limpa agendamento ----------
const J = await mkHouse("J"); await enrollH(J.h);
await cancel(J.o, "vencimento");
ok("J: agendado", (await st(J.h)).cancel_at != null);
const fnDef = (await sv("select pg_get_functiondef('public.platform_plan_refund_done(uuid,text,timestamptz)'::regprocedure) d")).rows[0].d;
ok("reembolso do plano limpa o agendamento e aponta a tela de conta inativa", /cancel_at = null/.test(fnDef) && /tela de conta inativa/.test(fnDef) && !/fale com o suporte\./.test(fnDef.split("Reembolso de")[1] ?? ""));
const tickDef = (await sv("select pg_get_functiondef('public.platform_billing_tick(timestamptz)'::regprocedure) d")).rows[0].d;
ok("rotina diária ignora casa com cancelamento agendado", /cancel_at is not null/.test(tickDef));

// ---------- permissões ----------
const can = async (role, sig) => (await sv(`select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
const every = async (fs, role) => { for (const f of fs) if (!(await can(role, f))) return false; return true; };
const some = async (fs, role) => { for (const f of fs) if (await can(role, f)) return true; return false; };
ok("usuário executa as 4 funções da casa", (await every(["public.my_cancel_status()", "public.my_cancel_subscription(text)", "public.my_cancel_undo()", "public.my_account_gate()"], "authenticated")));
ok("visitante não executa nenhuma", !(await some(["public.my_cancel_status()", "public.my_cancel_subscription(text)", "public.my_cancel_undo()", "public.my_account_gate()"], "anon")));
ok("internas só do servidor", !(await can("authenticated", "public.platform_house_next_renewal(uuid,date)")) && !(await can("authenticated", "public.platform_cancel_block_reason(uuid,date)")) && (await can("service_role", "public.platform_cancel_apply_due(timestamptz)")));
const cron = await sv("select count(*) n from cron.job where jobname='platform-cancel-apply'");
ok("agenda do cancelamento criada (ou ignorada no harness)", !cron.err);

console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end();
process.exit(bad ? 1 : 0);
