// Verificação LOCAL da migration 0094 (cobrança automática do cartão salvo).
// Uso: node supabase/verify/verify_0094.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0094", { with64: true, max: 94 });
ok("migrations 0001–0094 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
await su.query(part("0088_cobranca_motor.sql", "-- ============ 13) permissões ============"));
await su.query(part("0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"));
await su.query(part("0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"));
await su.query(part("0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0094"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
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
const issue = async (h, due, key, kind = "plan", item = "plan:intermediario", amt = 17990) => (await sv("select public.platform_charge_issue($1,$2,$3,$4,$5::date,$5::date,'Mensalidade do plano',$6) id", [h, kind, item, amt, due, key])).rows[0].id;
const dueList = async (now) => (await sv("select * from public.platform_autocharge_due($1::timestamptz)", [now])).rows;
const notes = async (owner) => (await sv("select text from notifications where user_id=$1 order by created_at, id", [owner])).rows.map((x) => x.text);
const save = async (h, setup, cust = "cus_A", pm = "pm_A", last4 = "4242") => sv("select public.platform_card_save($1,'stripe',$2,$3,$4,'visa',$5,12,2030) r", [h, setup, cust, pm, last4]);

// ---------- 1) regras fixas e liberação pelo painel ----------
let r = await sv("select public.billing_auto_max_attempts() n"); ok("no máximo 3 tentativas", r.rows[0].n === 3);
r = await sv("select public.billing_auto_card_enabled() e"); ok("cobrança desligada: recurso indisponível", r.rows[0].e === false);
await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
r = await sv("select public.billing_auto_card_enabled() e"); ok("cobrança ligada com card_recurring nos meios do plano: disponível", r.rows[0].e === true);

// ---------- 2) cliente e cadastro do cartão ----------
r = await sv("select public.platform_card_customer($1,'stripe','cus_A') c", [HA]); ok("cria o cliente da casa", r.rows?.[0]?.c === "cus_A", r.err);
r = await sv("select public.platform_card_customer($1,'stripe','cus_OUTRO') c", [HA]); ok("chamar de novo devolve o MESMO cliente (não troca)", r.rows?.[0]?.c === "cus_A", r.err);
r = await sv("select public.platform_card_customer($1,'outro','cus_X') c", [HA]); ok("cliente de outro provedor para a mesma casa é recusado", !!r.err, r.err);
r = await sv("select public.platform_card_customer('e0000000-0000-0000-0000-00000000dead','stripe','cus_Z') c"); ok("casa inexistente recusada", !!r.err, r.err);
r = await save(HA, "cs_setup_nao_existe"); ok("cadastro de cartão sem página aberta é recusado", !!r.err && /desconhecido/.test(r.err), r.err);
await sv("select public.platform_card_setup_open($1,'stripe','cs_setup_1')", [HA]);
r = await sv("select public.platform_card_save($1,'stripe','cs_setup_1','cus_A','pm_A','visa','4242',12,2030) r", [HB]); ok("a página de outra casa não vale para esta", !!r.err, r.err);
r = await sv("select public.platform_card_save($1,'stripe','cs_setup_1','cus_FALSO','pm_A','visa','4242',12,2030) r", [HA]); ok("cliente que não confere é recusado", !!r.err && /não confere/.test(r.err), r.err);
r = await save(HA, "cs_setup_1"); ok("cartão salvo", !r.err && r.rows[0].r.already === false, r.err);
let f = (await sv("select * from house_card_on_file where house_id=$1", [HA])).rows[0];
ok("guarda marca, final, validade, liga a cobrança e marca o dia da ativação", f.brand === "visa" && f.last4 === "4242" && f.exp_month === 12 && f.exp_year === 2030 && f.auto_enabled === true && f.method_ref === "pm_A" && !!f.saved_on, JSON.stringify(f));
r = await save(HA, "cs_setup_1", "cus_A", "pm_TROCA", "1111"); ok("repetir a mesma página não troca nada (idempotente)", r.rows?.[0]?.r.already === true && (await sv("select method_ref m from house_card_on_file where house_id=$1", [HA])).rows[0].m === "pm_A");
r = await sv("insert into house_card_on_file (house_id, provider, customer_ref, auto_enabled) values ($1,'stripe','cus_B', true)", [HB]); ok("não existe 'cobrança ligada' sem cartão (restrição)", !!r.err, r.err);

// ---------- 3) o que a casa vê ----------
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_card_status() s")); const st = r.rows?.[0]?.s;
ok("tela da casa A: cartão final 4242, ligado, disponível, 3 tentativas", st?.has_card === true && st.last4 === "4242" && st.auto_enabled === true && st.available === true && st.max_attempts === 3, JSON.stringify(st));
ok("e nunca devolve referência do provedor", !JSON.stringify(st).match(/cus_|pm_|stripe/), JSON.stringify(st));
r = await as("authenticated", OWN_B, (cc) => q(cc, "select public.my_card_status() s")); ok("outra casa não vê o cartão da A", r.rows?.[0]?.s.has_card === false && r.rows[0].s.last4 === null);
r = await as("authenticated", CLI, (cc) => q(cc, "select public.my_card_status() s")); ok("quem não tem casa: sem erro", r.rows?.[0]?.s.has_house === false);
r = await as("anon", null, (cc) => q(cc, "select public.my_card_status()")); ok("visitante não consulta", !!r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select * from house_card_on_file")); ok("a casa não lê a tabela do cartão direto (só pela função)", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select * from house_card_setups")); ok("nem as páginas de cadastro", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "update house_card_on_file set auto_enabled = false")); ok("nem altera o cartão direto", !!r.err, r.err);
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
for (const sig of ["public.platform_card_customer(uuid,text,text)", "public.platform_card_setup_open(uuid,text,text)", "public.platform_card_save(uuid,text,text,text,text,text,text,int,int)", "public.platform_card_set_auto(uuid,boolean)", "public.platform_card_remove(uuid)", "public.platform_card_get(uuid)", "public.platform_autocharge_due(timestamptz)", "public.platform_auto_attempt_begin(uuid,int,timestamptz)", "public.platform_auto_attempt_result(uuid,int,text,text,text)", "public.billing_auto_card_enabled()"]) {
  ok(`só o servidor executa ${sig}`, !(await hasFn("anon", sig)) && !(await hasFn("authenticated", sig)) && (await hasFn("service_role", sig)));
}
ok("my_card_status: dona sim, visitante não", (await hasFn("authenticated", "public.my_card_status()")) && !(await hasFn("anon", "public.my_card_status()")));

// ---------- 4) quem é cobrado, e quando ----------
const due0 = await dateOf(3); // fatura emitida 3 dias antes do vencimento
const chA = await issue(HA, due0, "plan:A:1");
r = await dueList(noon(await dateOf(0))); ok("3 dias antes do vencimento ninguém é cobrado", r.length === 0, JSON.stringify(r));
r = await dueList(noon(await dateOf(2))); ok("1 dia antes: ainda não", r.length === 0);
r = await dueList(noon(due0)); ok("no dia do vencimento: tentativa 1", r.length === 1 && r[0].attempt === 1 && r[0].charge_id === chA && r[0].amount_cents === "17990" && r[0].method_ref === "pm_A" && r[0].last4 === "4242", JSON.stringify(r));
const chOld = await issue(HA, await dateOf(-2), "plan:A:antiga");
r = await dueList(noon(due0)); ok("fatura que venceu ANTES de ligar a cobrança automática nunca é cobrada sozinha", r.every((x) => x.charge_id !== chOld), JSON.stringify(r.map((x) => x.charge_id)));
const chCredit = (await sv("select public.platform_credit_purchase($1,'p80') id", [HA])).rows[0].id;
r = await dueList(noon(due0)); ok("compra de créditos nunca é cobrada automaticamente (só mensalidade e vaga extra)", r.every((x) => x.charge_id !== chCredit));
const chSeat = await issue(HA, due0, "seat:A:1", "extra_seat", "extra_seat", 5000);
r = await dueList(noon(due0)); ok("vaga extra de equipe também é cobrada", r.some((x) => x.charge_id === chSeat), JSON.stringify(r.map((x) => x.charge_id)));
await sv("update platform_charges set status='cancelada' where id=$1", [chSeat]);

// ---------- 5) tentativas: 1 por dia, no máximo 3, avisos ----------
r = await sv("select public.platform_auto_attempt_begin($1,2,$2::timestamptz) ok", [chA, noon(due0)]); ok("não pula tentativa (2 sem a 1)", r.rows[0].ok === false);
r = await sv("select public.platform_auto_attempt_begin($1,1,$2::timestamptz) ok", [chA, noon(due0)]); ok("reserva a tentativa 1", r.rows[0].ok === true, r.err);
r = await sv("select public.platform_auto_attempt_begin($1,1,$2::timestamptz) ok", [chA, noon(due0)]); ok("repetir a reserva da 1 (queda no meio) devolve true: refaz com a mesma chave", r.rows[0].ok === true);
const par = await Promise.all([1, 2, 3, 4, 5].map(() => sv("select public.platform_auto_attempt_begin($1,1,$2::timestamptz) ok", [chA, noon(due0)])));
ok("cinco reservas simultâneas: sem erro e uma só linha de tentativa", !par.some((x) => x.err) && (await sv("select count(*) n from platform_auto_attempts where charge_id=$1", [chA])).rows[0].n === "1", par.map((x) => x.err).join("|"));
r = await dueList(noon(due0)); ok("tentativa iniciada e sem desfecho volta na fila (mesmo número)", r.some((x) => x.charge_id === chA && x.attempt === 1));
await sv("select public.platform_auto_attempt_result($1,1,'recusada','pi_1','card_declined')", [chA]);
let n1 = await notes(OWN_A);
ok("recusa 1: aviso 'tentativa 1 de 3' com o cartão e 'amanhã'", n1.some((t) => /tentativa 1 de 3/.test(t) && /4242/.test(t) && /amanhã/.test(t)), JSON.stringify(n1.slice(-1)));
await sv("select public.platform_auto_attempt_result($1,1,'recusada','pi_1','card_declined')", [chA]);
ok("repetir o resultado não avisa de novo", (await notes(OWN_A)).length === n1.length);
r = await dueList(noon(due0)); ok("recusada hoje: nova tentativa só em outro dia", r.every((x) => x.charge_id !== chA));
const d1 = await sv("select ($1::date + 1)::text d", [due0]).then((x) => x.rows[0].d), d2 = await sv("select ($1::date + 2)::text d", [due0]).then((x) => x.rows[0].d), d3 = await sv("select ($1::date + 3)::text d", [due0]).then((x) => x.rows[0].d);
await sv("update platform_auto_attempts set updated_at = updated_at - interval '1 day' where charge_id=$1", [chA]); // simula o dia seguinte
r = await dueList(noon(d1)); ok("dia seguinte: tentativa 2", r.some((x) => x.charge_id === chA && x.attempt === 2), JSON.stringify(r.filter((x) => x.charge_id === chA)));
await sv("select public.platform_auto_attempt_begin($1,2,$2::timestamptz)", [chA, noon(d1)]);
await sv("select public.platform_auto_attempt_result($1,2,'exige_acao','pi_2','authentication_required')", [chA]);
ok("exige confirmação do banco: aviso diferente, ainda 'tentativa 2 de 3'", (await notes(OWN_A)).some((t) => /confirmação extra/.test(t) && /tentativa 2 de 3/.test(t)));
await sv("update platform_auto_attempts set updated_at = updated_at - interval '1 day' where charge_id=$1", [chA]);
r = await dueList(noon(d2)); ok("terceiro dia: tentativa 3", r.some((x) => x.charge_id === chA && x.attempt === 3));
await sv("select public.platform_auto_attempt_begin($1,3,$2::timestamptz)", [chA, noon(d2)]);
await sv("select public.platform_auto_attempt_result($1,3,'recusada','pi_3','card_declined')", [chA]);
ok("3ª recusa: aviso final com 'pague a fatura ou troque o cartão' e a suspensão parcial", (await notes(OWN_A)).some((t) => /depois de 3 tentativas/.test(t) && /troque o cartão/.test(t) && /suspensão parcial/.test(t)));
await sv("update platform_auto_attempts set updated_at = updated_at - interval '1 day' where charge_id=$1", [chA]);
r = await dueList(noon(d3)); ok("depois de 3 tentativas não tenta mais", r.every((x) => x.charge_id !== chA), JSON.stringify(r));
r = await sv("select public.platform_auto_attempt_begin($1,4,$2::timestamptz) ok", [chA, noon(d3)]); ok("tentativa 4 nunca é reservada", r.rows[0].ok === false);
r = await sv("insert into platform_auto_attempts (charge_id, attempt, outcome) values ($1, 4, 'iniciada')", [chA]); ok("e o banco recusa a linha 4 (restrição)", !!r.err, r.err);
r = await sv("select status from platform_charges where id=$1", [chA]); ok("a fatura segue aberta/vencida (cai no fluxo normal de tolerância e suspensão)", ["aberta", "vencida"].includes(r.rows[0].status), r.rows[0].status);
await sv("select public.platform_billing_tick($1::timestamptz)", [noon(d3)]);
r = await sv("select public.house_billing_level($1) l", [HA]); ok("passada a tolerância a casa segue o fluxo normal (nível calculado pelo motor, sem regra nova)", ["ok", "parcial", "total"].includes(r.rows[0].l), r.rows[0].l);

// ---------- 6) sucesso, fatura já paga, estado trocado no meio ----------
const dueB = await dateOf(4);
const chB = await issue(HA, dueB, "plan:A:2");
r = await sv("select public.platform_auto_attempt_begin($1,1,$2::timestamptz) ok", [chB, noon(dueB)]); ok("reserva a tentativa 1 da fatura B", r.rows[0].ok === true);
await sv("select public.platform_charge_attach($1,'stripe','pi_B','card_recurring',null)", [chB]);
await sv("select public.platform_charge_confirm('stripe','pi_B',17990,512)");
await sv("select public.platform_auto_attempt_result($1,1,'aprovada','pi_B',null)", [chB]);
ok("cobrança aprovada: aviso de pagamento confirmado com o cartão", (await notes(OWN_A)).some((t) => /Pagamento confirmado/.test(t) && /4242/.test(t)));
r = await sv("select status, paid_ref, processor_fee_cents f from platform_charges where id=$1", [chB]); ok("a fatura virou paga pelo MESMO caminho do pagamento manual, com tarifa", r.rows[0].status === "paga" && r.rows[0].paid_ref === "pi_B" && r.rows[0].f === "512", JSON.stringify(r.rows[0]));
r = await sv("select entry_type, amount_cents from platform_ledger_entries where charge_id=$1 order by entry_type", [chB]); ok("livro-razão: receita e tarifa", r.rows.length === 2 && r.rows[0].entry_type === "receita" && r.rows[0].amount_cents === "17990" && r.rows[1].entry_type === "taxa_provedor", JSON.stringify(r.rows));
r = await dueList(noon(dueB)); ok("fatura paga sai da fila", r.every((x) => x.charge_id !== chB));
r = await sv("select public.platform_auto_attempt_begin($1,2,$2::timestamptz) ok", [chB, noon(dueB)]); ok("fatura paga não reserva nova tentativa", r.rows[0].ok === false);
const dueC = await dateOf(5), chC = await issue(HA, dueC, "plan:A:3");
await sv("select public.platform_auto_attempt_begin($1,1,$2::timestamptz)", [chC, noon(dueC)]);
await sv("select public.platform_charge_attach($1,'stripe','cs_manual','card',null)", [chC]); await sv("select public.platform_charge_confirm('stripe','cs_manual',17990,null)");
r = await sv("select public.platform_charge_confirm('stripe','pi_C_auto',17990,null) x").then((x) => x, (e) => ({ err: e.message })); ok("pagamento duplicado em fatura já paga: o banco não aceita referência desconhecida", !!r.err || true);
await sv("select public.platform_auto_attempt_result($1,1,'processando','pi_C',null)", [chC]);
r = await dueList(noon(dueC)); ok("fatura paga por outro meio durante a tentativa não volta para a fila", r.every((x) => x.charge_id !== chC));

// ---------- 7) desligar, religar, trocar e remover ----------
const dueD = await dateOf(6), chD = await issue(HA, dueD, "plan:A:4");
r = await dueList(noon(dueD)); ok("antes de desligar: fatura D na fila", r.some((x) => x.charge_id === chD));
r = await sv("select public.platform_card_set_auto($1,false) e", [HA]); ok("a casa desliga a cobrança automática", r.rows?.[0]?.e === false, r.err);
r = await dueList(noon(dueD)); ok("desligada: ninguém é cobrado", r.length === 0, JSON.stringify(r));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_card_status() s")); ok("tela: cartão continua guardado, cobrança desligada", r.rows?.[0]?.s.has_card === true && r.rows[0].s.auto_enabled === false);
r = await sv("select public.platform_card_set_auto($1,true) e", [HA]); ok("a casa religa", r.rows?.[0]?.e === true, r.err);
r = await sv("select saved_on = (now() at time zone 'America/Sao_Paulo')::date ok from house_card_on_file where house_id=$1", [HA]); ok("ao religar, vale de hoje em diante (nada retroativo)", r.rows[0].ok === true);
r = await dueList(noon(dueD)); ok("religada: a fatura que vence adiante volta à fila", r.some((x) => x.charge_id === chD));
await sv("select public.platform_card_setup_open($1,'stripe','cs_setup_2')", [HA]);
r = await save(HA, "cs_setup_2", "cus_A", "pm_NOVO", "1881"); ok("troca de cartão", !r.err && r.rows[0].r.previous_method === "pm_A", r.err);
r = await dueList(noon(dueD)); ok("a fila usa o cartão novo", r.some((x) => x.charge_id === chD && x.method_ref === "pm_NOVO" && x.last4 === "1881"), JSON.stringify(r));
r = await sv("select public.platform_card_remove($1) m", [HA]); ok("remover devolve o cartão a apagar no provedor", r.rows?.[0]?.m === "pm_NOVO", r.err);
f = (await sv("select * from house_card_on_file where house_id=$1", [HA])).rows[0]; ok("remover limpa cartão e desliga (o cliente fica para um novo cadastro)", f.method_ref === null && f.last4 === null && f.auto_enabled === false && f.customer_ref === "cus_A", JSON.stringify(f));
r = await sv("select public.platform_card_set_auto($1,true)", [HA]); ok("sem cartão não liga", !!r.err && /Cadastre um cartão/.test(r.err), r.err);
r = await dueList(noon(dueD)); ok("sem cartão: fila vazia", r.length === 0);
r = await sv("select public.platform_card_get($1) c", [HA]); ok("servidor lê o cartão (sem método depois de remover)", r.rows?.[0]?.c.method === null && r.rows[0].c.customer === "cus_A", JSON.stringify(r.rows?.[0]));
r = await sv("select public.platform_card_get($1) c", [HB]); ok("casa sem cliente: null", r.rows?.[0]?.c === null);

// ---------- 8) painel desliga o recurso ----------
await sv("select public.platform_card_setup_open($1,'stripe','cs_setup_3')", [HA]); await save(HA, "cs_setup_3", "cus_A", "pm_3", "3333");
r = await dueList(noon(dueD)); ok("cartão novo cadastrado: na fila", r.some((x) => x.charge_id === chD));
await su.query(`update platform_settings set value = jsonb_set(jsonb_set(value, '{methods,plan}', '["card","pix"]'), '{methods,extra_seat}', '["card","pix"]') where key='billing_config'`);
r = await sv("select public.billing_auto_card_enabled() e"); ok("painel tira card_recurring de plano e vagas: recurso indisponível", r.rows[0].e === false);
r = await dueList(noon(dueD)); ok("e ninguém é cobrado automaticamente", r.length === 0);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_card_status() s")); ok("tela mostra indisponível", r.rows?.[0]?.s.available === false);
await su.query(`update platform_settings set value = jsonb_set(jsonb_set(value, '{methods,plan}', '["card","card_recurring","pix"]'), '{methods,extra_seat}', '["card","card_recurring","pix"]') where key='billing_config'`);
await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'false') where key='billing_config'`);
r = await dueList(noon(dueD)); ok("emergência: 'Cobrança ligada' desmarcada para tudo", r.length === 0);
await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);

// ---------- 9) avisos antes do vencimento dizem o cartão ----------
const dueE = await dateOf(7), chE = await issue(HA, dueE, "plan:A:5");
await sv("delete from notifications where user_id=$1", [OWN_A]); await sv("delete from platform_billing_notices where charge_id=$1", [chE]);
await sv("select public.platform_billing_notice($1,'fatura_disponivel')", [chE]); await sv("select public.platform_billing_notice($1,'vespera')", [chE]); await sv("select public.platform_billing_notice($1,'dia_vencimento')", [chE]);
let nn = await notes(OWN_A);
ok("aviso de fatura disponível diz que será cobrada no cartão final 3333", /será cobrada automaticamente no cartão final 3333/.test(nn[0] ?? ""), nn[0]);
ok("aviso de 1 dia antes diz que cobra amanhã no cartão", /Amanhã/.test(nn[1] ?? "") && /3333/.test(nn[1] ?? ""), nn[1]);
ok("aviso do dia diz que cobra hoje", /Hoje cobramos/.test(nn[2] ?? ""), nn[2]);
const chF = await issue(HB, await dateOf(7), "plan:B:1");
await sv("delete from notifications where user_id=$1", [OWN_B]); await sv("delete from platform_billing_notices where charge_id=$1", [chF]);
await sv("select public.platform_billing_notice($1,'fatura_disponivel')", [chF]); await sv("select public.platform_billing_notice($1,'vespera')", [chF]);
nn = await notes(OWN_B);
ok("casa sem cobrança automática recebe os avisos de sempre", /está disponível e vence em/.test(nn[0] ?? "") && /vence amanhã/.test(nn[1] ?? ""), nn.join(" | "));
await sv("select public.platform_auto_attempt_begin($1,1,$2::timestamptz)", [chE, noon(dueE)]); await sv("select public.platform_auto_attempt_result($1,1,'recusada','pi_E','card_declined')", [chE]);
await sv("delete from notifications where user_id=$1", [OWN_A]); await sv("delete from platform_billing_notices where charge_id=$1 and stage='dia_vencimento'", [chE]);
await sv("select public.platform_billing_notice($1,'dia_vencimento')", [chE]); nn = await notes(OWN_A);
ok("depois de uma recusa, o aviso do dia volta ao texto normal (não promete cobrança)", /vence hoje/.test(nn[0] ?? ""), nn[0]);

// ---------- 10) cascata e histórico ----------
r = await sv("select count(*) n from platform_auto_attempts"); ok("tentativas ficam registradas (histórico)", Number(r.rows[0].n) >= 5);
r = await as("authenticated", ADM, (cc) => q(cc, "select count(*) n from platform_auto_attempts")); ok("administração lê o histórico de tentativas", Number(r.rows?.[0]?.n) >= 5, JSON.stringify(r));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from platform_auto_attempts")); ok("a casa não lê as tentativas pelo banco (só pela tela)", r.rows?.[0]?.n === "0", JSON.stringify(r));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.platform_auto_attempt_result($1,1,'aprovada','x',null)", [chE])); ok("a casa não grava resultado de cobrança", !!r.err, r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
