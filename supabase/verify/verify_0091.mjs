// Verificação LOCAL da migration 0091 (créditos de IA + compra avulsa fora da suspensão).
// Uso: node supabase/verify/verify_0091.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0091", { with64: true, max: 91 });
ok("migrations 0001–0091 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
await su.query(part("0088_cobranca_motor.sql", "-- ============ 13) permissões ============"));
await su.query(part("0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"));
await su.query(part("0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0091"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const ADM = "a1000000-0000-0000-0000-0000000000a1", OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2", OWN_C = "b3000000-0000-0000-0000-0000000000b3", CLI = "c1000000-0000-0000-0000-0000000000c1";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2", HC = "d3000000-0000-0000-0000-0000000000d3";
for (const [u, t] of [[ADM, "cliente"], [OWN_A, "casa"], [OWN_B, "casa"], [OWN_C, "casa"], [CLI, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','intermediario'), ($3,$4,'Casa B','casa-b','base'), ($5,$6,'Casa C','casa-c','intermediario')", [HA, OWN_A, HB, OWN_B, HC, OWN_C]);
const buy = (h, p) => sv("select public.platform_credit_purchase($1,$2) id", [h, p]);
const pay = async (chargeId, ref) => { await sv("select public.platform_charge_attach($1,'stripe',$2,'card','https://p/x')", [chargeId, ref]); const amt = (await sv("select amount_cents a from platform_charges where id=$1", [chargeId])).rows[0].a; return sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,null) r", [ref, amt]); };
const balance = async (h) => (await sv("select public.ai_credit_balance($1) b", [h])).rows[0].b;
const rec = async (h, u = CLI) => (await sv("select public.assistant_record_usage($1,$2,'modelo-x',10,20) r", [h, u])).rows?.[0]?.r;
const backdate = async (id, createdAgo, dueAgoDays, status) => { await sv("alter table platform_charges disable trigger trg_platform_charges_guard"); await sv("update platform_charges set created_at = now() - $2::interval, due_date = current_date - $3::int, status = $4 where id=$1", [id, createdAgo, dueAgoDays, status]); await sv("alter table platform_charges enable trigger trg_platform_charges_guard"); };
const fill = (h, n, ago = "0 days") => sv("insert into assistant_usage(house_id,user_id,model) select $1,$2,'m' from generate_series(1,$3)", [h, CLI, n]).then(async () => ago !== "0 days" && sv("update assistant_usage set created_at = now() - $2::interval where house_id=$1 and created_at > now() - interval '1 minute'", [h, ago]));

// ---------- 1) compra recusada quando não deve ----------
let r = await buy(HA, "p80"); ok("cobrança desligada: compra recusada", !!r.err && /cobranca_desligada/.test(r.err), r.err);
await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
r = await buy(HA, "p999"); ok("pacote inexistente recusado", !!r.err && /inválido/.test(r.err), r.err);
r = await buy(HB, "p80"); ok("plano sem assistente não compra créditos", !!r.err && /não inclui a assistente/.test(r.err), r.err);
r = await buy("e0000000-0000-0000-0000-00000000dead", "p80"); ok("casa inexistente recusada", !!r.err, r.err);

// ---------- 2) compra, preço do painel, reaproveitamento ----------
r = await buy(HA, "p80"); const ch80 = r.rows?.[0]?.id; ok("compra gera fatura do tipo credit_pack", !r.err && !!ch80, r.err);
let c = (await sv("select * from platform_charges where id=$1", [ch80])).rows[0];
ok("valor vem do painel (R$ 19,90), item p80, vence hoje, sem período", c.amount_cents === "1990" && c.item_key === "p80" && c.kind === "credit_pack" && c.period_start === null && c.status === "aberta", JSON.stringify(c));
r = await buy(HA, "p80"); ok("clique repetido reaproveita a fatura aberta", r.rows?.[0]?.id === ch80);
const par = await Promise.all([1, 2, 3, 4, 5].map(() => buy(HC, "p200")));
const ids = new Set(par.map((x) => x.rows?.[0]?.id)); ok("cinco compras simultâneas: uma só fatura", ids.size === 1 && !par.some((x) => x.err), par.map((x) => x.err).join("|"));
r = await sv("select count(*) n from platform_charges where house_id=$1 and kind='credit_pack'", [HC]); ok("e só uma linha no banco", r.rows[0].n === "1");
await sv(`update platform_settings set value = jsonb_set(value, '{credit_pack,p500}', '9990') where key='billing_prices'`);
r = await buy(HA, "p500"); c = (await sv("select amount_cents a from platform_charges where id=$1", [r.rows?.[0]?.id])).rows[0]; ok("preço editado no painel vale na próxima compra", c.a === "9990", JSON.stringify(c));
await sv(`update platform_settings set value = jsonb_set(value, '{credit_pack,p500}', '8990') where key='billing_prices'`);

// ---------- 3) compra avulsa abandonada não vira atraso, aviso nem suspensão ----------
await backdate(ch80, "5 days", 5, "vencida");
await sv("select public.platform_billing_tick()");
r = await sv("select status from platform_charges where id=$1", [ch80]); ok("compra abandonada há 5 dias foi cancelada pela rotina", r.rows[0].status === "cancelada", JSON.stringify(r.rows));
r = await sv("select count(*) n from platform_billing_notices where charge_id=$1", [ch80]); ok("e nunca gerou aviso de atraso/suspensão", r.rows[0].n === "1", "só o 'fatura_disponivel' da emissão: " + JSON.stringify(r.rows));
r = await sv("select public.house_billing_level($1) l", [HA]); ok("casa segue em dia", r.rows[0].l === "ok");
const abandoned = (await buy(HA, "p200")).rows[0].id;
await backdate(abandoned, "1 hour", 20, "vencida");
await sv("select public.platform_house_billing_recompute($1)", [HA]); await sv("select public.platform_billing_tick()");
r = await sv("select public.house_billing_level($1) l", [HA]); ok("compra avulsa vencida (mesmo há 20 dias) NÃO suspende a casa", r.rows[0].l === "ok", r.rows[0].l);
r = await sv("select status from platform_charges where id=$1", [abandoned]); ok("compra avulsa recente não é cancelada antes de 2 dias", r.rows[0].status === "vencida", r.rows[0].status);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_house_billing_status() s")); ok("e o card de atraso da casa não aparece por causa dela", r.rows?.[0]?.s.overdue === false, JSON.stringify(r.rows?.[0]));
await sv("update platform_charges set status='cancelada' where id=$1", [abandoned]);
// regressão: mensalidade em atraso continua suspendendo
const plan = (await sv("select public.platform_charge_issue($1,'plan','plan:intermediario',17990,(current_date - 30),(current_date - 30),'Mensalidade do plano',$2) id", [HC, "idem-plan-c"])).rows[0].id;
await sv("select public.platform_billing_tick()");
r = await sv("select public.house_billing_level($1) l", [HC]); ok("REGRESSÃO: mensalidade vencida há 30 dias continua suspendendo", r.rows[0].l === "parcial" || r.rows[0].l === "total", r.rows[0].l);
r = await buy(HC, "p80"); ok("casa suspensa não compra créditos", !!r.err && /Regularize/.test(r.err), r.err);
await pay(plan, "cs_plan_c"); await sv("select public.platform_billing_tick()");
r = await sv("select public.house_billing_level($1) l", [HC]); ok("pagou a mensalidade: volta ao normal", r.rows[0].l === "ok");

// ---------- 4) pagamento entrega o pacote ----------
const b80 = (await buy(HA, "p80")).rows[0].id;
r = await pay(b80, "cs_80"); ok("pagamento confirmado", !r.err, r.err);
let p = (await sv("select * from ai_credit_packs where house_id=$1", [HA])).rows;
ok("pacote de 80 entregue na hora, com 80 de saldo", p.length === 1 && p[0].size === 80 && p[0].remaining === 80 && p[0].charge_id === b80, JSON.stringify(p));
r = await sv("select (expires_at - purchased_at) > interval '89 days' and (expires_at - purchased_at) < interval '93 days' ok from ai_credit_packs where id=$1", [p[0].id]); ok("validade de 3 meses a partir da compra", r.rows[0].ok === true);
r = await sv("select public.platform_charge_confirm('stripe','cs_80',1990,null) r"); r = await sv("select count(*) n from ai_credit_packs where house_id=$1", [HA]); ok("confirmar de novo não duplica o pacote", r.rows[0].n === "1");
await sv("select public.platform_charge_attach($1,'stripe','cs_80b','card','https://p/y')", [(await buy(HA, "p80")).rows[0].id]).catch(() => 0);
r = await sv("select public.platform_charge_confirm('stripe','cs_80b',1990,null) r"); ok("segundo pagamento de outra fatura igual é outra compra legítima: outro pacote", (await balance(HA)) === 160, String(await balance(HA)));
ok("fatura de mensalidade não gera pacote", (await sv("select count(*) n from ai_credit_packs where house_id=$1", [HC])).rows[0].n === "0");
// ---------- 5) proteções do pacote ----------
p = (await sv("select * from ai_credit_packs where house_id=$1 order by purchased_at limit 1", [HA])).rows;
r = await sv("update ai_credit_packs set remaining = remaining + 1 where id=$1", [p[0].id]); ok("saldo do pacote não aumenta", !!r.err && /só diminui/.test(r.err), r.err);
r = await sv("update ai_credit_packs set size = 500 where id=$1", [p[0].id]); ok("tamanho do pacote não muda", !!r.err, r.err);
r = await sv("update ai_credit_packs set expires_at = expires_at + interval '1 year' where id=$1", [p[0].id]); ok("validade não se estende", !!r.err, r.err);
r = await sv("delete from ai_credit_packs where id=$1", [p[0].id]); ok("pacote não se apaga", !!r.err, r.err);
r = await sv("insert into ai_credit_packs (house_id,charge_id,size,remaining,expires_at) values ($1,$2,80,80,now()+interval '3 months')", [HA, b80]); ok("a mesma fatura não gera dois pacotes (índice único)", !!r.err, r.err);
r = await sv("insert into ai_credit_packs (house_id,charge_id,size,remaining,expires_at) select $1, id, 77, 77, now()+interval '3 months' from platform_charges where id=$2", [HA, plan]); ok("tamanho fora de 80/200/500 recusado", !!r.err, r.err);

// ---------- 6) consumo: franquia primeiro, depois o pacote mais antigo ----------
// Casa A (intermediário: franquia 300) com dois pacotes de 80 (saldo 160).
await fill(HA, 100, "40 days"); // mês passado não conta
r = await rec(HA); ok("1ª resposta do mês: dentro da franquia, nenhum crédito usado", r.used_month === 1 && r.from_credit === false && r.credits_left === 160, JSON.stringify(r));
await fill(HA, 238); // chega a 239
r = await rec(HA); ok("80% da franquia (240): aviso ao dono", r.used_month === 240, JSON.stringify(r));
r = await sv("select count(*) n from notifications where user_id=$1 and text like '%80%'", [OWN_A]); ok("exatamente um aviso de 80%", r.rows[0].n === "1", r.rows[0].n);
await fill(HA, 59); // 299
r = await rec(HA); ok("100% da franquia (300): aviso de que a assistente segue com os créditos", r.used_month === 300 && r.from_credit === false, JSON.stringify(r));
r = await sv("select text from notifications where user_id=$1 and text like '%franquia%'", [OWN_A]); ok("aviso de 100% informa o saldo de créditos", r.rows.length === 1 && /160/.test(r.rows[0].text), JSON.stringify(r.rows));
r = await rec(HA); ok("301ª resposta: debita 1 crédito", r.from_credit === true && r.credits_left === 159 && r.uncovered === false, JSON.stringify(r));
r = await sv("select p.remaining, p.purchased_at from ai_credit_packs p where p.house_id=$1 order by p.purchased_at, p.id", [HA]);
ok("o débito sai do pacote MAIS ANTIGO", r.rows[0].remaining === 79 && r.rows[1].remaining === 80, JSON.stringify(r.rows.map((x) => x.remaining)));
r = await sv("select count(*) n, count(distinct usage_id) d from ai_credit_ledger where house_id=$1", [HA]); ok("um lançamento por resposta", r.rows[0].n === "1" && r.rows[0].d === "1");
r = await sv("insert into ai_credit_ledger (house_id,pack_id,usage_id) select house_id,pack_id,usage_id from ai_credit_ledger limit 1"); ok("a mesma resposta não debita duas vezes (usage_id único)", !!r.err, r.err);
r = await sv("update ai_credit_ledger set pack_id = pack_id"); ok("livro de consumo é imutável", !!r.err, r.err);
for (let i = 0; i < 78; i++) await rec(HA);
r = await sv("select p.remaining from ai_credit_packs p where p.house_id=$1 order by p.purchased_at, p.id", [HA]); ok("consumiu o 1º pacote por inteiro antes de tocar no 2º", r.rows[0].remaining === 1 && r.rows[1].remaining === 80, JSON.stringify(r.rows.map((x) => x.remaining)));
await rec(HA); r = await sv("select p.remaining from ai_credit_packs p where p.house_id=$1 order by p.purchased_at, p.id", [HA]); ok("zerado o 1º, passa ao 2º", r.rows[0].remaining === 0 && r.rows[1].remaining === 80);
r = await rec(HA); ok("2º pacote começa a ser usado", r.from_credit === true && r.credits_left === 79, JSON.stringify(r));

// ---------- 7) validade ----------
await sv("alter table ai_credit_packs disable trigger trg_ai_credit_packs_guard");
await sv("update ai_credit_packs set purchased_at = now() - interval '100 days', expires_at = now() - interval '10 days' where house_id=$1", [HA]);
await sv("alter table ai_credit_packs enable trigger trg_ai_credit_packs_guard");
ok("pacote vencido não entra no saldo", (await balance(HA)) === 0, String(await balance(HA)));
r = await rec(HA); ok("e não é debitado: resposta fica sem cobertura (o portão da assistente barra antes)", r.from_credit === false && r.uncovered === true, JSON.stringify(r));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_ai_credit_status() s")); ok("tela: saldo 0 e nenhum pacote vencido listado", !r.err && r.rows[0].s.balance === 0 && r.rows[0].s.packs.length === 0, JSON.stringify(r.rows?.[0]));

// ---------- 8) créditos acabando e concorrência ----------
await sv("insert into ai_credit_packs (house_id,charge_id,size,remaining,expires_at) select $1, id, 80, 3, now()+interval '3 months' from platform_charges where id=$2", [HC, plan]);
await fill(HC, 300);
const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => rec(HC)));
const debited = rs.filter((x) => x.from_credit).length, unc = rs.filter((x) => x.uncovered).length;
ok("6 respostas simultâneas com 3 créditos: exatamente 3 debitadas e 3 sem cobertura", debited === 3 && unc === 3, JSON.stringify(rs.map((x) => [x.used_month, x.from_credit])));
ok("contagens distintas (sem corrida)", new Set(rs.map((x) => x.used_month)).size === 6);
ok("saldo nunca fica negativo", (await balance(HC)) === 0);
r = await sv("select count(*) n from notifications where user_id=$1 and text like '%créditos de respostas acabaram%'", [OWN_C]); ok("aviso de créditos acabando (uma vez)", r.rows[0].n === "1", r.rows[0].n);
r = await sv("select count(*) n from ai_credit_ledger where house_id=$1", [HC]); ok("livro de consumo: 3 lançamentos", r.rows[0].n === "3");

// ---------- 9) plano sem assistente e estorno ----------
r = await rec(HB); ok("casa sem assistente: nunca debita crédito", r.from_credit === false && r.limit === 0 && r.uncovered === false, JSON.stringify(r));
const b200 = (await buy(HC, "p200")).rows[0].id; await pay(b200, "cs_200");
ok("pacote de 200 entregue", (await balance(HC)) === 200);
await sv("update platform_charges set status='estornada' where id=$1", [b200]);
ok("fatura estornada pelo provedor: o saldo que sobrou deixa de valer", (await balance(HC)) === 0, String(await balance(HC)));

// ---------- 10) tela, permissões ----------
r = await as("authenticated", OWN_B, (cc) => q(cc, "select public.my_ai_credit_status() s")); ok("tela da casa sem assistente: franquia 0, não está à venda", !r.err && r.rows[0].s.limit === 0 && r.rows[0].s.for_sale === false, JSON.stringify(r.rows?.[0]));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_ai_credit_status() s")); ok("tela da casa A: preços do painel e à venda", !r.err && r.rows[0].s.for_sale === true && r.rows[0].s.prices.p80 === 1990 && r.rows[0].s.limit === 300, JSON.stringify(r.rows?.[0]));
r = await as("authenticated", CLI, (cc) => q(cc, "select public.my_ai_credit_status() s")); ok("quem não tem casa: sem erro", !r.err && r.rows[0].s.has_house === false);
r = await as("anon", null, (cc) => q(cc, "select public.my_ai_credit_status()")); ok("visitante não consulta", !!r.err);
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
for (const sig of ["public.assistant_record_usage(uuid,uuid,text,int,int)", "public.platform_credit_purchase(uuid,text)", "public.ai_credit_balance(uuid)", "public.assistant_monthly_limit(text)", "public.ai_credit_packs_guard()", "public.ai_credit_packs_on_refund()"]) {
  ok(`anon e authenticated não executam ${sig}`, !(await hasFn("anon", sig)) && !(await hasFn("authenticated", sig)));
}
ok("service_role executa consumo e compra", (await hasFn("service_role", "public.assistant_record_usage(uuid,uuid,text,int,int)")) && (await hasFn("service_role", "public.platform_credit_purchase(uuid,text)")));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from ai_credit_packs")); ok("dona da casa A lê só os próprios pacotes", Number(r.rows?.[0]?.n) === 2, JSON.stringify(r));
r = await as("authenticated", OWN_B, (cc) => q(cc, "select count(*) n from ai_credit_packs")); ok("outra casa não lê pacotes alheios", r.rows?.[0]?.n === "0");
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from ai_credit_ledger")); ok("dona da casa não lê o livro de consumo (só administração)", r.rows?.[0]?.n === "0");
r = await as("authenticated", ADM, (cc) => q(cc, "select count(*) n from ai_credit_ledger")); ok("administração lê o livro de consumo", Number(r.rows?.[0]?.n) >= 4);
r = await as("authenticated", OWN_A, (cc) => q(cc, "update ai_credit_packs set remaining = 999")); ok("dona da casa não altera saldo", !!r.err || r.n === 0, r.err ?? String(r.n));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.platform_credit_purchase($1,'p80')", [HA])); ok("dona da casa não compra direto pelo banco (só pelo backend)", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.assistant_record_usage($1,$2,'m',1,1)", [HA, CLI])); ok("dona da casa não registra uso/débito pelo banco", !!r.err, r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
