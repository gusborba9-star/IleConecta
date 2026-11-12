// Verificação LOCAL da migration 0089 (várias páginas de pagamento por fatura, tarifa depois, duplicidade, card da casa).
// Uso: node supabase/verify/verify_0089.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0089", { with64: true, max: 89 });
ok("migrations 0001–0089 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(readFileSync(new URL("../migrations/0088_cobranca_motor.sql", import.meta.url), "utf8").split("-- ============ 13) permissões ============")[1]);
await su.query(readFileSync(new URL("../migrations/0089_cobranca_tentativas_e_card.sql", import.meta.url), "utf8").split("-- ============ 7) permissões ============")[1]);
const as = async (role, uid, fn) => { const c = await connect("vf0089"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const j = (o) => JSON.stringify(o);
const ADM = "a1000000-0000-0000-0000-0000000000a1", OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2";
const CLI_NOHOUSE = "c9000000-0000-0000-0000-0000000000c9";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2";
for (const [u, t] of [[ADM, "cliente"], [OWN_A, "casa"], [OWN_B, "casa"], [CLI_NOHOUSE, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','base'), ($3,$4,'Casa B','casa-b','base')", [HA, OWN_A, HB, OWN_B]);
await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const sv = (sql, p) => q(su, sql, p);
const issue = async (h, idem, due = "2026-11-10", cand = "2026-11-10") => (await sv("select public.platform_charge_issue($1,'plan','plan:base',8990,$2,$3,'Mensalidade do plano',$4) id", [h, due, cand, idem])).rows?.[0]?.id;
const get = async (id) => (await sv("select * from platform_charges where id=$1", [id])).rows[0];

// ---------- 1) várias páginas de pagamento ----------
const c1 = await issue(HA, "idem-0089-a1");
let r = await sv("select public.platform_charge_attach($1,'stripe','cs_1','pix','https://pay.example/1')", [c1]); ok("primeira página de pagamento (Pix)", !r.err, r.err);
r = await sv("select public.platform_charge_attach($1,'stripe','cs_2','pix','https://pay.example/2')", [c1]);
ok("nova página (o Pix expirou): a referência atual muda", !r.err && (await get(c1)).provider_ref === "cs_2", r.err);
r = await sv("select count(*) n from platform_charge_refs where charge_id=$1", [c1]); ok("as duas referências ficam no histórico", r.rows[0].n === "2");
r = await sv("select public.platform_charge_attach($1,'stripe','cs_2','card','https://pay.example/2b')", [c1]); ok("repetir a mesma referência é idempotente", !r.err && (await sv("select count(*) n from platform_charge_refs where charge_id=$1", [c1])).rows[0].n === "2", r.err);
const c2 = await issue(HB, "idem-0089-b1");
r = await sv("select public.platform_charge_attach($1,'stripe','cs_1','pix','https://pay.example/x')", [c2]); ok("referência de outra fatura é recusada", !!r.err && /outra_fatura/.test(r.err), r.err);
r = await sv("update platform_charges set provider='stripe', provider_ref='cs_2' where id=$1", [c2]); ok("referência atual de outra fatura não pode ser copiada (índice único)", !!r.err, r.err);
await sv("update platform_charges set provider=null, provider_ref=null where id=$1", [c2]);
r = await sv("select public.platform_charge_of_ref('stripe','cs_1') id"); ok("a referência antiga ainda acha a fatura", r.rows[0].id === c1);
r = await sv("select public.platform_charge_of_ref('stripe','cs_zzz') id"); ok("referência desconhecida não acha nada", r.rows[0].id === null);

// ---------- 2) andamento ----------
r = await sv("select public.platform_charge_progress('stripe','cs_1','failed','2026-11-11T12:00:00-03:00') s"); ok("falha de página ANTIGA não derruba a fatura", !r.err && (await get(c1)).status === "aberta", r.err);
r = await sv("select public.platform_charge_progress('stripe','cs_2','processing','2026-11-11T12:00:00-03:00') s"); ok("pagamento em andamento na página atual", (await get(c1)).status === "em_processamento", r.err);
r = await sv("select public.platform_charge_attach($1,'stripe','cs_3','pix','https://pay.example/3')", [c1]); ok("com pagamento em andamento não se troca a página", !!r.err, r.err);
r = await sv("select public.platform_charge_progress('stripe','cs_2','failed','2026-11-11T12:00:00-03:00') s"); ok("falha da página atual volta a fatura para vencida (venceu em 10/11)", (await get(c1)).status === "vencida", r.err);

// ---------- 3) confirmação, duplicidade, tarifa ----------
r = await sv("select public.platform_charge_confirm('stripe','cs_1',8000,null,'2026-11-11T12:00:00-03:00') r"); ok("valor diferente é recusado", !!r.err && /valor_divergente/.test(r.err), r.err);
r = await sv("select public.platform_charge_confirm('stripe','cs_1',8990,null,'2026-11-11T12:00:00-03:00') r");
let ch = await get(c1);
ok("pagar pela página antiga vale (o cliente pode ter pago antes de expirar)", !r.err && ch.status === "paga" && ch.paid_ref === "cs_1" && ch.processor_fee_cents === null, r.err);
r = await sv("select count(*) n from platform_ledger_entries where charge_id=$1", [c1]); ok("só a receita foi lançada (tarifa desconhecida não vira zero)", r.rows[0].n === "1");
r = await sv("select public.platform_charge_confirm('stripe','cs_1',8990,null) r"); ok("confirmar de novo a mesma referência: idempotente, sem duplicidade", !r.err && r.rows[0].r.already === true && !r.rows[0].r.duplicate, j(r.rows?.[0]));
r = await sv("select public.platform_charge_confirm('stripe','cs_2',8990,null) r"); ok("pagar também pela outra página: marcado como duplicado", !r.err && r.rows[0].r.duplicate === true, r.err);
r = await sv("select count(*) n, max(reason) m from platform_billing_events where kind='pagamento_duplicado'"); ok("pagamento duplicado vira evento visível para devolução", r.rows[0].n === "1" && /cs_2/.test(r.rows[0].m), j(r.rows[0]));
r = await sv("select public.platform_charge_confirm('stripe','cs_2',8990,null) r"); r = await sv("select count(*) n from platform_billing_events where kind='pagamento_duplicado'"); ok("repetir o aviso duplicado não duplica o evento", r.rows[0].n === "1");
r = await sv("select count(*) n from platform_ledger_entries where charge_id=$1", [c1]); ok("duplicidade não gera lançamento de receita", r.rows[0].n === "1");
r = await sv("select public.platform_charge_record_fee('stripe','cs_2',100) ok"); ok("tarifa pela referência que NÃO pagou é ignorada", r.rows[0].ok === false);
r = await sv("select public.platform_charge_record_fee('stripe','cs_1',150) ok"); ok("tarifa conhecida depois: gravada uma vez", r.rows[0].ok === true && (await get(c1)).processor_fee_cents === "150");
r = await sv("select entry_type, amount_cents from platform_ledger_entries where charge_id=$1 order by entry_type", [c1]); ok("livro-razão: receita e tarifa", j(r.rows) === j([{ entry_type: "receita", amount_cents: "8990" }, { entry_type: "taxa_provedor", amount_cents: "150" }]), j(r.rows));
r = await sv("select public.platform_charge_record_fee('stripe','cs_1',999) ok"); ok("segunda tentativa de tarifa é ignorada", r.rows[0].ok === false && (await get(c1)).processor_fee_cents === "150");
r = await sv("select public.platform_charge_record_fee('stripe','cs_1',-1) ok"); ok("tarifa negativa recusada (fatura já tem tarifa: ignorada antes)", r.rows[0].ok === false || !!r.err);
const c3 = await issue(HA, "idem-0089-a3", "2026-12-10", "2026-12-10");
await sv("select public.platform_charge_attach($1,'stripe','cs_p3','card','https://pay.example/p3')", [c3]);
await sv("select public.platform_charge_confirm('stripe','cs_p3',8990,null)");
r = await sv("select public.platform_charge_record_fee('stripe','cs_p3',99999) ok"); ok("tarifa maior que a fatura recusada", !!r.err && /tarifa_invalida/.test(r.err), r.err);
r = await sv("update platform_charges set paid_amount_cents = 1 where id=$1", [c1]); ok("valor pago não muda depois de gravado", !!r.err, r.err);
r = await sv("update platform_charges set paid_ref = 'x' where id=$1", [c1]); ok("referência do pagamento não muda", !!r.err, r.err);
r = await sv("update platform_charges set processor_fee_cents = 1 where id=$1", [c1]); ok("tarifa gravada não muda", !!r.err, r.err);
r = await sv("update platform_charge_refs set ref='outra' where charge_id=$1", [c1]); ok("histórico de referências é imutável", !!r.err, r.err);
r = await sv("select public.platform_charge_attach($1,'stripe','cs_9','pix','https://pay.example/9')", [c1]); ok("fatura paga não aceita nova página", !!r.err, r.err);

// ---------- 4) card da casa: só com fatura em atraso ----------
const st = (uid, h) => as("authenticated", uid, (c) => q(c, "select public.my_house_billing_status($1) s", [h]));
r = await st(OWN_B, HB); ok("casa B com fatura de 10/11 em aberto e hoje depois dela: atraso", !r.err && r.rows[0].s.overdue === true && r.rows[0].s.charges.length === 1, j(r.rows?.[0]));
const s0 = r.rows[0].s;
ok("o card traz o fim da tolerância e a data do bloqueio total", !!s0.charges[0].tolerance_end && !!s0.charges[0].total_on && s0.charges[0].amount_cents === 8990, j(s0.charges[0]));
r = await st(OWN_A, HB); ok("outra casa não lê o status da casa B", !!r.err && /not_allowed/.test(r.err), r.err);
r = await st(ADM, HB); ok("administrador lê o status de qualquer casa", !r.err);
r = await st(OWN_A, HA); ok("casa A (tudo pago): sem atraso → card não aparece", !r.err && r.rows[0].s.overdue === false && r.rows[0].s.charges.length === 0, j(r.rows?.[0]));
r = await as("authenticated", OWN_B, (c) => q(c, "select public.my_house_billing_status() s")); ok("sem informar a casa, a dona consulta a própria", !r.err && r.rows[0].s.house_id === HB, j(r.rows?.[0]));
r = await as("authenticated", CLI_NOHOUSE, (c) => q(c, "select public.my_house_billing_status() s")); ok("quem não tem casa recebe estado normal, sem erro", !r.err && r.rows[0].s.overdue === false && r.rows[0].s.house_id === null, j(r.rows?.[0]));
r = await as("anon", null, (c) => q(c, "select public.my_house_billing_status($1)", [HA])); ok("visitante não consulta", !!r.err, r.err);
r = await sv("select public.platform_charge_attach($1,'stripe','cs_b1','pix','https://pay.example/b1')", [c2]);
await sv("select public.platform_charge_confirm('stripe','cs_b1',8990,null)");
r = await st(OWN_B, HB); ok("ao pagar, o atraso some e o card some", !r.err && r.rows[0].s.overdue === false, j(r.rows?.[0]));

// ---------- 5) permissões ----------
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
for (const sig of ["public.platform_charge_of_ref(text,text)", "public.platform_charge_record_fee(text,text,bigint)"]) {
  ok(`anon não executa ${sig}`, !(await hasFn("anon", sig))); ok(`authenticated não executa ${sig}`, !(await hasFn("authenticated", sig))); ok(`service_role executa ${sig}`, await hasFn("service_role", sig));
}
ok("authenticated executa my_house_billing_status (com trava interna); anon não", (await hasFn("authenticated", "public.my_house_billing_status(uuid)")) && !(await hasFn("anon", "public.my_house_billing_status(uuid)")));
r = await as("authenticated", OWN_A, (c) => q(c, "select count(*) n from platform_charge_refs")); ok("dono da casa não lê o histórico de referências", r.rows?.[0]?.n === "0", j(r));
r = await as("authenticated", ADM, (c) => q(c, "select count(*) n from platform_charge_refs")); ok("administrador lê o histórico", Number(r.rows?.[0]?.n) >= 4, j(r));
r = await as("authenticated", OWN_A, (c) => q(c, "select public.platform_charge_record_fee('stripe','cs_1',1)")); ok("dono da casa não grava tarifa", !!r.err, r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
