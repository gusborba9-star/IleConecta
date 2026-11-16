// Verificação LOCAL da migration 0126 (CPF/CNPJ da casa).
// Uso: node supabase/verify/verify_0126.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"], ["0126_contratacao_de_plano_no_app.sql", "-- ============ 8) permissões ============"]];
const name = "vf0126";
const { c: su, failed } = await freshDb(name, { with64: true, max: 125 });
ok("migrations 0001–0125 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) { try { await su.query(part(f, m)); } catch { /* assinatura antiga */ } }
await su.query("insert into vault.secrets(name, secret) values ('tax_id_key', 'chave-de-teste-0126')");
const mig = readFileSync(new URL("../migrations/0126_cpf_cnpj_da_casa.sql", import.meta.url), "utf8");
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0126 aplica e reaplica sem erro", e0 === null, e0 ?? "");
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
  const O = `b0126000-0000-0000-0000-00000000${hex}`, H = `d0126000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${tag}`, `casa-${tag}-${i}`, plan]);
  if (billing) await sv("insert into house_billing_plan(house_id,billing_day,started_on,active) values ($1,$2,current_date-$3::int,true)", [H, billing, startedAgo]);
  return { O, H };
}
let n = 0;
const pay = async (id, amount) => {
  const ref = `cs_0126_${++n}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'pix',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,59)", [ref, amount]);
  if (r.err) throw new Error(r.err);
};
// primeiro pagamento antigo (fora da janela de 7 dias), para a casa poder trocar de plano
const oldPaid = async (H, plan) => {
  const id = (await sv("select public.platform_charge_issue($1,'plan',$2,$3::bigint,current_date-40,current_date-40,'teste',$4) id", [H, "plan:" + plan, cents(plan), `v0126-old-${++n}`])).rows[0].id;
  await pay(id, cents(plan));
  const up = await force("update platform_charges set paid_at = now() - interval '40 days', created_at = now() - interval '40 days' where id=$1", [id]); if (up.err) console.log("UPD ERR", up.err);
  return id;
};
const billingDayFor = (offset) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + offset); return Math.min(d.getUTCDate(), 28); };
// CASOS
const cnt = async (sql, p) => (await sv(sql, p)).rows[0].n;
const CPF = "52998224725", CNPJ = "11222333000181";
const kind = async (v) => (await sv("select public.tax_id_kind($1) k", [v])).rows[0].k;
ok("CPF válido (com ou sem pontuação)", (await kind(CPF)) === "cpf" && (await kind("529.982.247-25")) === "cpf");
ok("CNPJ válido (com ou sem pontuação)", (await kind(CNPJ)) === "cnpj" && (await kind("11.222.333/0001-81")) === "cnpj");
ok("dígito verificador errado é recusado", (await kind("52998224726")) === null && (await kind("11222333000182")) === null);
ok("sequências repetidas, tamanho errado, vazio e texto são recusados", (await kind("11111111111")) === null && (await kind("00000000000000")) === null && (await kind("123")) === null && (await kind("")) === null && (await kind(null)) === null && (await kind("abc")) === null && (await kind("5299822472")) === null);
ok("formata CPF e CNPJ", (await sv("select public.tax_id_format($1) a, public.tax_id_format($2) b, public.tax_id_format('123') c", [CPF, CNPJ])).rows[0].a === "529.982.247-25" && (await sv("select public.tax_id_format($1) b", [CNPJ])).rows[0].b === "11.222.333/0001-81");

// ---- cenário: casa assinante sem documento
const A = await mk("a", "maximo", { billing: billingDayFor(-10) });
await oldPaid(A.H, "base");
let r = await sv("select public.platform_seat_issue($1)", [A.H]);
ok("sem documento: vaga extra é recusada com a instrução", !!r.err && /Informe o CPF ou CNPJ/.test(r.err), r.err);
const B = await mk("b", "base", { billing: billingDayFor(-10) });
await oldPaid(B.H, "base");
r = await sv("select public.platform_upgrade_issue($1,'maximo')", [B.H]);
ok("sem documento: upgrade de plano é recusado", !!r.err && /Informe o CPF ou CNPJ/.test(r.err), r.err);
const G = await mk("g", "gratis");
r = await sv("select public.platform_subscribe_issue($1,'base')", [G.H]);
ok("sem documento: assinar plano pago é recusado", !!r.err && /Informe o CPF ou CNPJ/.test(r.err), r.err);
const Z = await mk("z", "base");
await sv("insert into house_billing_state(house_id, cancelled_at) values ($1, now())", [Z.H]);
r = await sv("select public.platform_reactivation_issue($1,'maximo')", [Z.H]);
ok("sem documento: reativar é recusado", !!r.err && /Informe o CPF ou CNPJ/.test(r.err), r.err);
ok("casa Grátis nunca é obrigada a informar (só ao contratar)", (await as(G.O, (c) => q(c, "select public.my_tax_id_status() s"))).rows[0].s.set === false);

// ---- a casa informa
r = await as(A.O, (c) => q(c, "select public.my_tax_id_set('123.456.789-00') r"));
ok("documento inválido é recusado com mensagem clara", !!r.err && /inválido/.test(r.err), r.err);
r = await as(A.O, (c) => q(c, "select public.my_tax_id_set($1) r", ["529.982.247-25"]));
ok("documento válido é aceito", !r.err && r.rows[0].r.kind === "cpf", r.err);
const stA = (await as(A.O, (c) => q(c, "select public.my_tax_id_status() s"))).rows[0].s;
ok("a casa vê só o final mascarado, nunca o número", stA.set === true && stA.kind === "cpf" && stA.masked === "***.***.***-25" && !JSON.stringify(stA).includes("5299822"), JSON.stringify(stA));
r = await as(A.O, (c) => q(c, "select public.my_tax_id_set($1) r", [CNPJ]));
ok("informar de novo é recusado (correção pelo Suporte)", !!r.err && /fale com o Suporte/.test(r.err), r.err);
const row = (await sv("select kind, masked, encode(doc_enc, 'hex') hx, position($1 in convert_from(doc_enc, 'LATIN1')) pos from house_tax_ids where house_id=$2", [CPF, A.H])).rows[0];
ok("no banco o número está criptografado (não aparece em texto)", row.kind === "cpf" && row.pos === 0 && !row.hx.includes(Buffer.from(CPF).toString("hex")), JSON.stringify({ p: row.pos }));
r = await as(A.O, (c) => q(c, "select * from house_tax_ids"));
ok("nenhum usuário lê a tabela direto", !!r.err && /permission denied/.test(r.err), r.err);
r = await as(B.O, (c) => q(c, "select public.tax_id_key()"));
ok("ninguém chama a chave nem a gravação interna", !!r.err);
r = await as(B.O, (c) => q(c, "select public.tax_id_store($1,$2,$3,true)", [A.H, CNPJ, B.O]));
ok("outra casa não grava documento de terceiros pela função interna", !!r.err);
r = await as(B.O, (c) => q(c, "select public.my_tax_id_status() s"));
ok("a outra casa continua sem documento", r.rows[0].s.set === false);
r = await sv("select public.platform_seat_issue($1) id", [A.H]);
ok("com documento a vaga extra é emitida normalmente", !r.err && !!r.rows[0].id, r.err);
await as(B.O, (c) => q(c, "select public.my_tax_id_set($1)", [CNPJ]));
r = await sv("select public.platform_upgrade_issue($1,'maximo') id", [B.H]);
ok("com documento o upgrade é emitido", !r.err && !!r.rows[0].id, r.err);

// ---- administração
const ADM = "b0126999-0000-0000-0000-000000000001";
await su.query("insert into auth.users(id,email) values ($1,'adm@x.com')", [ADM]);
await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Adm','Salvador') on conflict (id) do nothing", [ADM]);
await su.query("insert into admins(user_id) values ($1)", [ADM]);
r = await as(A.O, (c) => q(c, "select public.admin_house_tax_id($1,'consulta de teste ok') r", [A.H]));
ok("quem não é administrador não consulta", !!r.err && /not_admin/.test(r.err), r.err);
r = await as(ADM, (c) => q(c, "select public.admin_house_tax_id($1,'curto') r", [A.H]));
ok("administração precisa de motivo (10+ caracteres)", !!r.err && /motivo/.test(r.err), r.err);
r = await as(ADM, (c) => q(c, "select public.admin_house_tax_id($1,'conferir cobrança da casa') r", [A.H]));
ok("administração vê o número formatado e a consulta fica registrada", !r.err && r.rows[0].r.doc === "529.982.247-25" && await cnt("select count(*)::int n from tax_id_access_log where house_id=$1 and action='ver' and admin_id=$2", [A.H, ADM]) === 1, r.err ?? JSON.stringify(r.rows[0].r));
r = await as(ADM, (c) => q(c, "select public.admin_house_tax_id($1,'conferir casa sem documento') r", [G.H]));
ok("casa sem documento: informa que não há", !r.err && r.rows[0].r.set === false);
r = await as(ADM, (c) => q(c, "select public.admin_house_tax_id_set($1,$2,'correção pedida pelo suporte') r", [A.H, CNPJ]));
const after = (await as(ADM, (c) => q(c, "select public.admin_house_tax_id($1,'conferir correção feita') r", [A.H]))).rows[0].r;
ok("administração corrige com motivo e fica registrado", !r.err && after.kind === "cnpj" && after.doc === "11.222.333/0001-81" && await cnt("select count(*)::int n from tax_id_access_log where house_id=$1 and action='corrigir'", [A.H]) === 1, r.err);
r = await as(ADM, (c) => q(c, "select public.admin_house_tax_id_set($1,'111.111.111-11','correção inválida teste') r", [A.H]));
ok("correção inválida é recusada e não apaga o documento", !!r.err && (await as(ADM, (c) => q(c, "select public.admin_house_tax_id($1,'conferir depois de erro') r", [A.H]))).rows[0].r.doc === "11.222.333/0001-81");
r = await as(ADM, (c) => q(c, "select * from tax_id_access_log"));
ok("nem a administração lê o log direto (só pelas funções)", !!r.err && /permission denied/.test(r.err), r.err);

// ---- permissões
const acl = (await sv(`select has_function_privilege('anon','public.my_tax_id_set(text)','execute') a, has_function_privilege('authenticated','public.my_tax_id_set(text)','execute') b,
  has_function_privilege('authenticated','public.tax_id_key()','execute') c, has_function_privilege('authenticated','public.tax_id_store(uuid,text,uuid,boolean)','execute') d,
  has_function_privilege('anon','public.admin_house_tax_id(uuid,text)','execute') e, has_function_privilege('authenticated','public.platform_require_tax_id(uuid)','execute') f,
  has_function_privilege('anon','public.my_tax_id_status()','execute') g`)).rows[0];
ok("permissões: my_* só logado; chave, gravação interna e exigência fechadas", !acl.a && acl.b && !acl.c && !acl.d && !acl.e && !acl.f && !acl.g, JSON.stringify(acl));
// ---- reaplicar não perde nem troca o documento
const keyBefore = (await sv("select secret from vault.secrets where name='tax_id_key'")).rows[0].secret;
await su.query(mig);
const keyAfter = (await sv("select secret from vault.secrets where name='tax_id_key'")).rows[0].secret;
ok("reaplicar a migration não troca a chave nem apaga documentos", keyBefore === keyAfter && await cnt("select count(*)::int n from house_tax_ids", []) >= 2);

console.log(`\n${total - bad}/${total} ok`);
await su.end?.();
process.exit(bad ? 1 : 0);
