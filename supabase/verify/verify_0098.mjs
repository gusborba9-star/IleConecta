// Verificação LOCAL da migration 0098 (reembolso do primeiro pagamento do plano em 7 dias).
// Uso: node supabase/verify/verify_0098.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0098", { with64: true, max: 98 });
ok("migrations 0001–0098 aplicadas sem erro", failed.length === 0, failed.join(" | "));
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
const as = async (role, uid, fn) => { const c = await connect("vf0098"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
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
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
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

// matrícula de A e B (calendário de cobrança) e cartão de A
for (const h of [HA, HB]) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,'2026-10-10',true)", [h]);
await sv("select public.platform_card_customer($1,'stripe','cus_A')", [HA]);
await sv("insert into house_card_setups(ref,house_id,provider) values ('seti_A',$1,'stripe')", [HA]);
await sv("select public.platform_card_save($1,'stripe','seti_A','cus_A','pm_A','visa','4242',12,2030)", [HA]);

// ---------- 1) quem pode pedir ----------
const P1 = await pay(HA, { at: "2026-11-10T12:00:00-03:00", due: "2026-11-10" });
const P2 = await pay(HA, { at: "2026-11-11T12:00:00-03:00", due: "2026-11-11", amt: 17990 }); // segundo pagamento de plano
const X = await pay(HA, { kind: "extra_seat", item: "seat:1", at: "2026-11-10T13:00:00-03:00", due: "2026-11-12", amt: 5000 });
let r = await begin(HA, P2.id, T0); ok("o segundo pagamento de plano não é reembolsável (só o primeiro)", !!r.err && /só para o primeiro pagamento/.test(r.err), r.err);
r = await begin(HA, X.id, T0); ok("vaga extra não entra neste reembolso", !!r.err && /não pode ser reembolsada/.test(r.err), r.err);
r = await begin(HB, P1.id, T0); ok("outra casa não pede o reembolso da A", !!r.err && /não pode ser reembolsada/.test(r.err), r.err);
r = await begin(HA, P1.id, new Date(Date.now() + 8 * 864e5).toISOString()); ok("depois de 7 dias não reembolsa", !!r.err && /prazo de 7 dias/.test(r.err), r.err);
r = await begin(HA, "00000000-0000-0000-0000-000000000000", T0); ok("cobrança inexistente: erro claro", !!r.err && /não pode ser reembolsada/.test(r.err), r.err);
let s = await mine(OWN_A);
ok("tela da casa A: elegível, com o valor integral e o prazo", s?.eligible === true && s.charge_id === P1.id && Number(s.amount_cents) === 17990 && s.cancelled === false && !!s.deadline, JSON.stringify(s));
s = await mine(OWN_B); ok("tela da casa B (sem pagamento): não elegível", s?.has_house === true && s.eligible === false && s.charge_id === null || s?.eligible === false, JSON.stringify(s));
r = await as("authenticated", CLI, (cc) => q(cc, "select public.my_plan_refund() s")); ok("quem não tem casa: sem erro e sem elegibilidade", !r.err && r.rows[0].s.has_house === false && r.rows[0].s.eligible === false, JSON.stringify(r));
r = await as("anon", null, (cc) => q(cc, "select public.my_plan_refund()")); ok("visitante não consulta", !!r.err);

// ---------- 2) começar: registra, repetir não duplica, uma vez por casa ----------
r = await begin(HA, P1.id, T0); const b1 = r.rows?.[0]?.r;
ok("começa o reembolso do valor integral (R$ 179,90) com a referência do pagamento", !r.err && b1.amount_cents === 17990 && b1.ref === P1.ref && b1.provider === "stripe" && b1.resume === false, r.err || JSON.stringify(b1));
ok("começar não muda nada ainda: assinatura, bloqueio e cartão seguem iguais", (await level(HA)) === "ok" && (await sv("select active from house_billing_plan where house_id=$1", [HA])).rows[0].active === true && (await sv("select auto_enabled a from house_card_on_file where house_id=$1", [HA])).rows[0].a === true);
r = await begin(HA, P1.id, T0); const b1b = r.rows?.[0]?.r; ok("pedir de novo retoma o mesmo reembolso (não duplica)", !r.err && b1b.refund_id === b1.refund_id && b1b.resume === true, r.err);
ok("há um só reembolso ativo na casa", Number((await sv("select count(*) n from platform_plan_refunds where house_id=$1", [HA])).rows[0].n) === 1);
s = await mine(OWN_A); ok("com o pedido em andamento a tela não oferece de novo e mostra no histórico", s.eligible === false && s.history.length === 1 && s.history[0].status === "pendente", JSON.stringify(s));
r = await sv("select * from public.platform_plan_refunds_pending(interval '0 seconds')"); ok("a rotina enxerga o pedido sem resposta do provedor", r.rows.length === 1 && r.rows[0].refund_id === b1.refund_id && r.rows[0].ref === P1.ref, JSON.stringify(r.rows));
r = await sv("select * from public.platform_plan_refunds_pending(interval '1 hour')"); ok("pedidos recentes ainda não são refeitos", r.rows.length === 0);

// ---------- 3) provedor recusa: nada muda ----------
await sv("insert into notifications(user_id,text) values ($1,'marcador')", [OWN_A]);
await sv("select public.platform_plan_refund_fail($1,'recusado')", [b1.refund_id]);
let rf = await refundRow(b1.refund_id);
ok("recusado: o reembolso fica 'falhou', e a assinatura continua ativa", rf.status === "falhou" && rf.error === "recusado" && (await level(HA)) === "ok" && (await sv("select active from house_billing_plan where house_id=$1", [HA])).rows[0].active === true && (await sv("select status from platform_charges where id=$1", [P1.id])).rows[0].status === "paga");
ok("a casa é avisada de que a assinatura continua ativa", (await sv("select count(*) n from notifications where user_id=$1 and text like 'Não foi possível concluir o reembolso do plano%'", [OWN_A])).rows[0].n === "1");
r = await sv("select public.platform_plan_refund_fail($1,'outra vez')", [b1.refund_id]); ok("repetir a falha não faz nada", !r.err && (await refundRow(b1.refund_id)).error === "recusado");
r = await sv("update platform_plan_refunds set status='pendente' where id=$1", [b1.refund_id]); ok("reembolso encerrado não volta a pendente", !!r.err, r.err);
r = await begin(HA, P1.id, T0); const b2 = r.rows?.[0]?.r; ok("depois da recusa a casa pode tentar de novo (novo pedido)", !r.err && b2.refund_id !== b1.refund_id && b2.resume === false, r.err);

// ---------- 4) conclui: cancela a assinatura ----------
const openPlan = await issue(HA, "2026-12-10", "aberta-plano-casa-A-1", "plan", "plan:intermediario", 17990);
const openSeat = await issue(HA, "2026-12-12", "aberta-vaga-casa-A-1", "extra_seat", "seat:2", 5000);
const openPack = await issue(HA, "2026-12-15", "aberta-pack-casa-A-1", "credit_pack", "pack:p80", 1990);
await sv("update platform_charges set status='vencida' where id=$1", [openSeat]).catch(() => {});
r = await sv("select public.platform_plan_refund_done($1,'re_123') r", [b2.refund_id]); ok("conclui o reembolso", !r.err && r.rows[0].r.already === false && r.rows[0].r.amount_cents === 17990, r.err);
rf = await refundRow(b2.refund_id);
ok("reembolso concluído, com a referência do provedor", rf.status === "concluido" && rf.provider_ref === "re_123" && !!rf.done_at);
ok("a fatura do primeiro pagamento vira 'estornada'", (await sv("select status from platform_charges where id=$1", [P1.id])).rows[0].status === "estornada");
ok("livro-razão: estorno integral de R$ 179,90", (await sv("select entry_type t, amount_cents::int c from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [P1.id])).rows.length === 1 && (await sv("select amount_cents::int c from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [P1.id])).rows[0].c === 17990);
ok("a casa sai da matrícula: a cobrança mensal para", (await sv("select active from house_billing_plan where house_id=$1", [HA])).rows[0].active === false);
ok("faturas abertas do plano e de vagas extras são canceladas", (await sv("select status from platform_charges where id=$1", [openPlan])).rows[0].status === "cancelada" && (await sv("select status from platform_charges where id=$1", [openSeat])).rows[0].status === "cancelada");
ok("a compra de créditos em aberto não é mexida", (await sv("select status from platform_charges where id=$1", [openPack])).rows[0].status === "aberta");
ok("os outros pagamentos já feitos seguem pagos", (await sv("select status from platform_charges where id=$1", [P2.id])).rows[0].status === "paga" && (await sv("select status from platform_charges where id=$1", [X.id])).rows[0].status === "paga");
ok("a cobrança automática do cartão desliga (o cartão continua salvo)", (await sv("select auto_enabled a, method_ref m from house_card_on_file where house_id=$1", [HA])).rows[0].a === false && (await sv("select method_ref m from house_card_on_file where house_id=$1", [HA])).rows[0].m === "pm_A");
ok("a casa fica inativa: bloqueio total", (await level(HA)) === "total" && (await sv("select public.house_billing_blocked($1) b", [HA])).rows[0].b === true);
ok("a casa B não é afetada", (await level(HB)) === "ok" && (await sv("select active from house_billing_plan where house_id=$1", [HB])).rows[0].active === true);
ok("aviso à casa com o valor e o que mudou", (await sv("select count(*) n from notifications where user_id=$1 and text like 'Reembolso de R$ 179,90 aprovado: a assinatura do plano foi cancelada%' and href='/planos'", [OWN_A])).rows[0].n === "1");
ok("evento do sistema registrado", Number((await sv("select count(*) n from platform_billing_events where kind='plano_reembolsado' and reason=$1", [HA])).rows[0].n) === 1);
r = await sv("select public.platform_plan_refund_done($1,'re_123') r", [b2.refund_id]); ok("concluir de novo não duplica nada", !r.err && r.rows[0].r.already === true && Number((await sv("select count(*) n from platform_ledger_entries where charge_id=$1 and entry_type='estorno'", [P1.id])).rows[0].n) === 1, r.err);
r = await sv("select public.platform_plan_refund_fail($1,'tarde')", [b2.refund_id]); ok("falha depois de concluir não desfaz", !r.err && (await refundRow(b2.refund_id)).status === "concluido");
await sv("select public.platform_house_billing_recompute($1)", [HA]);
ok("o recálculo diário NÃO reativa a casa cancelada (sem fatura vencida)", (await level(HA)) === "total");
const tickAfter = "2027-01-20T09:00:00-03:00";
const planBefore = Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan'", [HA])).rows[0].n);
const planBBefore = Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan'", [HB])).rows[0].n);
await sv("select public.platform_billing_tick($1::timestamptz)", [tickAfter]);
ok("a rotina diária não gera mais fatura de plano para a casa cancelada", Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan'", [HA])).rows[0].n) === planBefore);
ok("(controle) a mesma rotina segue gerando fatura para a casa B", Number((await sv("select count(*) n from platform_charges where house_id=$1 and kind='plan'", [HB])).rows[0].n) > planBBefore);
s = await mine(OWN_A); ok("tela da casa A: cancelada e sem nova oferta; histórico concluído", s.cancelled === true && s.eligible === false && s.history[0].status === "concluido", JSON.stringify(s));
r = await begin(HA, P2.id, T0); ok("depois de concluído, nenhum outro pagamento da casa é reembolsável por aqui", !!r.err, r.err);
r = await begin(HA, P1.id, T0); ok("a mesma cobrança não é reembolsada duas vezes", !!r.err && /já foi reembolsada|não pode ser reembolsada/.test(r.err), r.err);

// ---------- 5) reativação pelo suporte ----------
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.admin_billing_reactivate($1,'motivo de teste ok')", [HA])); ok("a própria casa não se reativa", !!r.err, r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_billing_reactivate($1,'curto')", [HA])); ok("o suporte precisa informar o motivo", !!r.err && /motivo/.test(r.err), r.err);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_billing_reactivate($1,'Casa pediu para voltar, pagamento novo combinado')", [HA])); ok("o suporte reativa a casa", !r.err, r.err);
ok("a casa volta ao nível normal e fica registrado na auditoria", (await level(HA)) === "ok" && Number((await sv("select count(*) n from admin_audit where key='billing_reactivate'")).rows[0].n) === 1);
ok("reativar não religa a matrícula nem o cartão sozinho (o suporte matricula depois)", (await sv("select active from house_billing_plan where house_id=$1", [HA])).rows[0].active === false && (await sv("select auto_enabled a from house_card_on_file where house_id=$1", [HA])).rows[0].a === false);
r = await as("authenticated", ADM, (cc) => q(cc, "select public.admin_billing_reactivate($1,'Tentativa repetida sem necessidade')", [HA])); ok("reativar de novo uma casa que não está cancelada: erro claro", !!r.err && /não está cancelada/.test(r.err), r.err);
r = await sv("select count(*) n from platform_plan_refunds where house_id=$1 and status='concluido'", [HA]); ok("o direito de 7 dias fica usado para sempre nesta casa", r.rows[0].n === "1");
await sv("insert into platform_charges(house_id,kind,item_key,amount_cents,due_date,idempotency_key,status,paid_at,paid_amount_cents,provider,provider_ref) values ($1,'plan','plan:intermediario',17990,'2026-12-01','novo-primeiro-A-0001','paga','2026-12-01T12:00:00-03','17990','stripe','cs_novo_A')", [HA]).catch(() => {});
r = await begin(HA, (await sv("select id from platform_charges where idempotency_key='novo-primeiro-A-0001'")).rows[0]?.id ?? "00000000-0000-0000-0000-000000000000", "2026-12-02T12:00:00-03:00"); ok("depois de voltar, um novo pagamento já é recontratação: sem novo reembolso", !!r.err, r.err);

// ---------- 6) a regra de bloqueio por atraso continua igual ----------
const L = await issue(HB, "2026-10-01", "atrasada-casa-B-0001", "plan", "plan:intermediario", 17990);
await sv("select public.platform_billing_tick($1::timestamptz)", ["2026-11-20T09:00:00-03:00"]);
ok("(regressão) fatura de plano muito atrasada continua suspendendo a casa (parcial ou total)", ["parcial", "total"].includes(await level(HB)), await level(HB));
await sv("select public.platform_charge_attach($1,'stripe','cs_late_B','card',null)", [L]);
await sv("select public.platform_charge_confirm('stripe','cs_late_B',17990::bigint,59,'2026-11-21T10:00:00-03:00'::timestamptz)");
ok("(regressão) pagando a fatura, a casa volta ao normal", (await level(HB)) === "ok", await level(HB));

// ---------- 7) leitura, imutabilidade e permissões ----------
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from platform_plan_refunds")); ok("a casa A lê só os próprios reembolsos de plano (2: o que falhou e o concluído)", Number(r.rows?.[0]?.n) === 2, JSON.stringify(r));
r = await as("authenticated", OWN_B, (cc) => q(cc, "select count(*) n from platform_plan_refunds")); ok("a casa B não lê os da A", r.rows?.[0]?.n === "0", JSON.stringify(r));
r = await as("authenticated", ADM, (cc) => q(cc, "select count(*) n from platform_plan_refunds")); ok("a administração lê todos", Number(r.rows?.[0]?.n) === 2, JSON.stringify(r));
r = await sv("update platform_plan_refunds set amount_cents = 1 where id=$1", [b2.refund_id]); ok("reembolso encerrado não muda (nem pelo servidor)", !!r.err, r.err);
r = await sv("delete from platform_plan_refunds where id=$1", [b2.refund_id]); ok("reembolso não é apagado", !!r.err, r.err);
r = await sv("update platform_ledger_entries set amount_cents = 1 where charge_id=$1", [P1.id]); ok("livro-razão segue imutável", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "insert into platform_plan_refunds(charge_id,house_id,amount_cents) values ($1,$2,1)", [P2.id, HA])); ok("a casa não escreve direto na tabela", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "update house_billing_state set cancelled_at = null where house_id=$1", [HA])); ok("a casa não limpa o próprio cancelamento", !!r.err || r.n === 0, r.err);
r = await as("anon", null, (cc) => q(cc, "select count(*) from platform_plan_refunds")); ok("visitante não lê", !!r.err, r.err);
for (const sig of ["platform_plan_refund_begin(uuid,uuid,uuid,timestamptz)", "platform_plan_refund_done(uuid,text,timestamptz)", "platform_plan_refund_fail(uuid,text)", "platform_plan_refunds_pending(interval)"]) {
  ok(`${sig}: só o servidor executa`, !(await hasFn("anon", `public.${sig}`)) && !(await hasFn("authenticated", `public.${sig}`)) && (await hasFn("service_role", `public.${sig}`)));
}
ok("my_plan_refund: logado e servidor executam, visitante não", !(await hasFn("anon", "public.my_plan_refund()")) && (await hasFn("authenticated", "public.my_plan_refund()")));
ok("admin_billing_reactivate: logado e servidor executam (a função confere se é administrador), visitante não", !(await hasFn("anon", "public.admin_billing_reactivate(uuid,text)")) && (await hasFn("authenticated", "public.admin_billing_reactivate(uuid,text)")));
ok("o gatilho de proteção não é executável por visitante nem logado", !(await hasFn("anon", "public.platform_plan_refunds_guard()")) && !(await hasFn("authenticated", "public.platform_plan_refunds_guard()")));
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
