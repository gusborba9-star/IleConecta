// Verificação LOCAL da migration 0106 (conta reutilizada: marca, reembolso de 7 dias, painel e avisos do administrador).
// Uso: node supabase/verify/verify_0106.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"]];
const name = "vf0106";
const { c: su, failed } = await freshDb(name, { with64: true, max: 106 });
ok("migrations 0001–0106 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
await sv(`update platform_settings set value = jsonb_set(jsonb_set(value, '{enabled}', 'true'), '{methods,plan}', '["pix","card","card_recurring"]') where key='billing_config'`);

let seq = 0;
async function mk(tag, email, { type = "casa" } = {}) {
  const i = ++seq; const hex = String(i).padStart(4, "0");
  const O = `b0106000-0000-0000-0000-00000000${hex}`, H = `d0106000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, email]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa','Salvador') on conflict (id) do update set account_type=$2", [O, type]);
  if (type === "casa") {
    await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'maximo')", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`]);
    await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,10,current_date-40,true)", [H]);
  }
  return { O, H };
}
let n = 0;
const paidPlan = async (H) => {
  const key = `v0106-${++n}-${H.slice(-4)}`;
  const id = (await sv("select public.platform_charge_issue($1,'plan','plan:maximo',29990::bigint,((now() at time zone 'America/Sao_Paulo')::date),current_date,'teste',$2) id", [H, key])).rows[0].id;
  const ref = `cs_0106_${n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,29990::bigint,59)", [ref]);
  if (r.err) throw new Error(r.err);
  return id;
};
// exclui a conta como a rotina faz (anonimiza e troca o e-mail do login)
const deleteAcct = async (O) => {
  await sv("insert into account_deletion_requests(user_id, execute_after) values ($1, now() - interval '1 minute')", [O]);
  const rq = (await sv("select id from account_deletion_requests where user_id=$1", [O])).rows[0].id;
  const r = await sv("select public.anonymize_account_and_queue($1,$2)", [O, rq]);
  if (r.err) throw new Error("anonymize: " + r.err);
  await sv("update auth.users set email = 'excluida+' || id || '@invalid.local' where id=$1", [O]);
  return r;
};

// ---- A) normalização do e-mail
const key = async (e) => (await sv("select public.email_key($1) k", [e])).rows[0].k;
ok("A: maiúsculas/minúsculas e espaços", (await key("  Fulano@Exemplo.com ")) === "fulano@exemplo.com");
ok("A: +apelido é ignorado", (await key("fulano+teste@exemplo.com")) === "fulano@exemplo.com");
ok("A: pontos no gmail são ignorados", (await key("Fu.la.no+x@gmail.com")) === "fulano@gmail.com" && (await key("fulano@googlemail.com")) === "fulano@gmail.com");
ok("A: pontos fora do gmail contam", (await key("fu.lano@exemplo.com")) !== (await key("fulano@exemplo.com")));
ok("A: texto sem arroba dá nulo", (await key("sem-arroba")) === null);

// ---- B) conta que usou o reembolso de 7 dias, excluída, volta com o mesmo e-mail
const ADM = await mk("adm", "admin@x.com", { type: "cliente" });
await su.query("insert into public.admins(user_id) values ($1)", [ADM.O]);
const X = await mk("x", "Fu.lano+casa@gmail.com");
const cX = await paidPlan(X.H);
const bx = await sv("select public.platform_plan_refund_begin($1,$2,$3) r", [X.H, cX, X.O]);
ok("B: a conta original consegue pedir o reembolso de 7 dias", !bx.err, bx.err);
await sv("select public.platform_plan_refund_done($1,'re_x')", [bx.rows[0].r.refund_id]);
ok("B: reembolso concluído", (await sv("select status from platform_plan_refunds where house_id=$1", [X.H])).rows[0].status === "concluido");
await sv("update house_billing_state set cancelled_at = now() where house_id=$1", [X.H]).catch(() => {});
const del = await deleteAcct(X.O);
ok("B: conta original anonimizada", !del.err, del.err);
ok("B: a exclusão ficou barrada enquanto a assinatura estava ativa (rede de segurança no servidor)", await (async () => { const Z = await mk("z", "zeta@exemplo.com"); await sv("insert into account_deletion_requests(user_id, execute_after) values ($1, now() - interval '1 minute')", [Z.O]); const rq = (await sv("select id from account_deletion_requests where user_id=$1", [Z.O])).rows[0].id; const e = await sv("select public.anonymize_account_and_queue($1,$2)", [Z.O, rq]); return !!e.err && /impedimentos/.test(e.err); })());
const Y = await mk("y", "fulano@gmail.com");
ok("B: a nova conta é reconhecida como reutilizada (e-mail em variação)", (await sv("select count(*)::int n from public.account_prior_deleted($1)", [Y.O])).rows[0].n === 1);
const cY = await paidPlan(Y.H);
let r = await sv("select public.platform_plan_refund_begin($1,$2,$3) r", [Y.H, cY, Y.O]);
ok("B: o reembolso de 7 dias NÃO vale de novo, com o motivo", !!r.err && /Conta reutilizada: o reembolso de 7 dias não está incluído/.test(r.err), r.err);
ok("B: nenhum reembolso foi criado para a nova casa", Number((await sv("select count(*) n from platform_plan_refunds where house_id=$1", [Y.H])).rows[0].n) === 0);
r = await as(Y.O, (c) => q(c, "select public.my_plan_refund() r"));
ok("B: a tela mostra que não é elegível e por quê", r.rows?.[0]?.r?.eligible === false && r.rows[0].r.returning === true, JSON.stringify(r.rows?.[0]?.r ?? r.err));

// ---- C) controle: conta excluída que NUNCA usou o reembolso não impede o da nova
const P = await mk("p", "pessoa@exemplo.com");
await paidPlan(P.H);
await sv("update house_billing_plan set active=false where house_id=$1", [P.H]); // cancelou a assinatura (senão a exclusão é barrada)
await deleteAcct(P.O);
const Q = await mk("q", "pessoa@exemplo.com");
const cQ = await paidPlan(Q.H);
r = await sv("select public.platform_plan_refund_begin($1,$2,$3) r", [Q.H, cQ, Q.O]);
ok("C: voltou, mesmo sem ter usado o reembolso antes: conta reutilizada não inclui o benefício", !!r.err && /Conta reutilizada/.test(r.err), r.err);
r = await as(Q.O, (c) => q(c, "select public.my_plan_refund() r"));
ok("C: a nova conta é reconhecida como reutilizada e não elegível", (await sv("select count(*)::int n from public.account_prior_deleted($1)", [Q.O])).rows[0].n === 1 && r.rows?.[0]?.r?.returning === true && r.rows?.[0]?.r?.eligible === false, JSON.stringify(r.rows?.[0]?.r ?? r.err));

// ---- D) conta nova de verdade e outra sem relação não são marcadas
const N = await mk("n", "nova@exemplo.com");
ok("D: conta nova não é marcada", (await sv("select count(*)::int n from public.account_prior_deleted($1)", [N.O])).rows[0].n === 0);
const cN = await paidPlan(N.H);
r = await sv("select public.platform_plan_refund_begin($1,$2,$3) r", [N.H, cN, N.O]);
ok("D: conta nova tem o reembolso normal", !r.err, r.err);

// ---- E) painel do administrador
r = await as(ADM.O, (c) => q(c, "select * from public.admin_returning_accounts()"));
ok("E: a lista traz as duas contas reutilizadas (Y e Q) e só elas", !r.err && r.rows.length === 2 && r.rows.every((x) => [Y.O, Q.O].includes(x.user_id)), r.err ?? JSON.stringify(r.rows.map((x) => x.user_id)));
const ry = r.rows?.find((x) => x.user_id === Y.O);
ok("E: Y aparece com reembolso já usado, e-mail mascarado, cobranças anteriores", ry?.refund_used === true && /^fu\*\*\*@gmail\.com$/.test(ry.email_masked) && Number(ry.prior_charges) === 1 && ry.prior_count === 1, JSON.stringify(ry));
ok("E: Q aparece sem reembolso usado", r.rows?.find((x) => x.user_id === Q.O)?.refund_used === false);
r = await as(Y.O, (c) => q(c, "select * from public.admin_returning_accounts()"));
ok("E: quem não é administrador não vê a lista", !!r.err, JSON.stringify(r.rows));

// ---- F) histórico com motivo e auditoria
r = await as(ADM.O, (c) => q(c, "select public.admin_returning_history($1,'curto') h", [Y.O]));
ok("F: sem motivo suficiente, recusa", !!r.err && /motivo/i.test(r.err), r.err);
r = await as(Y.O, (c) => q(c, "select public.admin_returning_history($1,'consulta de teste da administração') h", [Y.O]));
ok("F: não administrador é recusado", !!r.err, r.err);
r = await as(ADM.O, (c) => q(c, "select public.admin_returning_history($1,'consulta de teste da administração') h", [N.O]));
ok("F: conta sem histórico é recusada", !!r.err && /histórico/.test(r.err), r.err);
r = await as(ADM.O, (c) => q(c, "select public.admin_returning_history($1,'consulta de teste da administração') h", [Y.O]));
const hh = r.rows?.[0]?.h;
ok("F: histórico traz identidade, cobranças, reembolso e aceites", !r.err && hh.identidades.length === 1 && hh.cobrancas.length === 1 && hh.reembolsos_do_plano.length === 1 && hh.reembolsos_do_plano[0].status === "concluido" && Array.isArray(hh.aceites), r.err ?? JSON.stringify(hh).slice(0, 200));
ok("F: o histórico NÃO traz e-mail em claro", !JSON.stringify(hh).includes("gmail"));
ok("F: a consulta ficou registrada", Number((await sv("select count(*) n from support_case_log where action='historico_conta_reutilizada' and actor=$1", [ADM.O])).rows[0].n) === 1);

// ---- G) avisos
r = await as(ADM.O, (c) => q(c, "select public.admin_notify_returning($1,'reembolso_nao_incluso',null,'aviso de teste da administração')", [Y.O]));
ok("G: aviso-modelo enviado", !r.err, r.err);
const tx = (await sv("select text from notifications where user_id=$1 order by created_at desc limit 1", [Y.O])).rows[0]?.text ?? "";
ok("G: texto neutro, sem acusação e sem valores", /Conta reutilizada: este e-mail já esteve vinculado a uma conta excluída/.test(tx) && !/fraude|golpe|dívida|R\$/i.test(tx), tx);
r = await as(ADM.O, (c) => q(c, "select public.admin_notify_returning($1,'livre','curto','aviso de teste da administração')", [Y.O]));
ok("G: aviso livre curto demais é recusado", !!r.err, r.err);
r = await as(ADM.O, (c) => q(c, "select public.admin_notify_returning($1,'livre','Olá! Precisamos conversar sobre o histórico da sua conta anterior.','aviso de teste da administração')", [Y.O]));
ok("G: aviso livre válido", !r.err, r.err);
r = await as(ADM.O, (c) => q(c, "select public.admin_notify_returning($1,'inexistente',null,'aviso de teste da administração')", [Y.O]));
ok("G: modelo inexistente é recusado", !!r.err, r.err);
r = await as(ADM.O, (c) => q(c, "select public.admin_notify_returning($1,'registros_anteriores',null,'aviso de teste da administração')", [N.O]));
ok("G: aviso para conta sem histórico é recusado", !!r.err, r.err);
r = await as(Y.O, (c) => q(c, "select public.admin_notify_returning($1,'registros_anteriores',null,'aviso de teste da administração')", [Y.O]));
ok("G: não administrador não envia aviso", !!r.err, r.err);
ok("G: os avisos ficaram registrados", Number((await sv("select count(*) n from support_case_log where action='aviso_conta_reutilizada'")).rows[0].n) === 2);

// ---- permissões (reaplica as da migration; o ambiente de teste concede tudo)
await su.query(readFileSync(new URL("../migrations/0106_conta_reutilizada.sql", import.meta.url), "utf8").split("-- ============ 5) permissões ============")[1]);
const acl = async (fn) => (await sv("select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u, has_function_privilege('service_role', $1, 'execute') s", [fn])).rows[0];
let allOk = true; const badF = [];
for (const fn of ["public.email_key(text)", "public.account_prior_deleted(uuid)", "public.house_owner_is_returning(uuid)", "public.platform_plan_refund_begin(uuid,uuid,uuid,timestamptz)"]) { const a = await acl(fn); if (a.a || a.u || !a.s) { allOk = false; badF.push(fn); } }
for (const fn of ["public.my_plan_refund()", "public.admin_returning_accounts()", "public.admin_returning_history(uuid,text)", "public.admin_notify_returning(uuid,text,text,text)"]) { const a = await acl(fn); if (a.a || !a.u || !a.s) { allOk = false; badF.push(fn); } }
ok("permissões: ajudantes só no servidor; telas só para logado (anon nunca)", allOk, badF.join(","));

console.log(`\n${total - bad}/${total} verificações passaram`);
await su.end();
process.exit(bad ? 1 : 0);
