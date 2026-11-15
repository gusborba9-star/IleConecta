// Verificação LOCAL da migration 0123 (desconto de pontualidade no Pix). Uso: node supabase/verify/verify_0123.mjs (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"], ["0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"], ["0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"], ["0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"], ["0098_reembolso_plano_7_dias.sql", "-- ============ 7) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0100_reajuste_tabela_comercial.sql", "-- ============ 7) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"], ["0103_cancelar_com_divida_e_aceite_cartoes.sql", "-- ============ 5) permissões ============"], ["0108_contratacao_de_plano_no_app.sql", "-- ============ 8) permissões ============"]];
const name = "vf0123";
const { c: su, failed } = await freshDb(name, { with64: true, max: 122 });
ok("migrations 0001–0122 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
const mig = readFileSync(new URL("../migrations/0123_desconto_pontualidade_pix.sql", import.meta.url), "utf8");
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0123 aplica e reaplica sem erro", e0 === null, e0 ?? "");
const q = (sql, p) => su.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = q;
await sv(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
const setCfg = (pd) => sv(`update platform_settings set value = (case when $1::jsonb is null then value - 'pix_discount' else value || jsonb_build_object('pix_discount', $1::jsonb) end) where key='billing_config'`, [pd ? JSON.stringify(pd) : null]);
const D = { enabled: true, pct: 5, ends_days_before: 1 };

// ---- configuração válida
const cfgOk = async (obj) => (await sv("select public.billing_config_ok((select value from platform_settings where key='billing_config') || jsonb_build_object('pix_discount', $1::jsonb)) r", [JSON.stringify(obj)])).rows[0].r;
ok("config aceita pix_discount válido", (await cfgOk(D)) === true);
ok("config recusa pct 0, 21, texto, chave extra, chave faltando, dias 15", !(await cfgOk({ ...D, pct: 0 })) && !(await cfgOk({ ...D, pct: 21 })) && !(await cfgOk({ ...D, pct: "5" })) && !(await cfgOk({ ...D, x: 1 })) && !(await cfgOk({ enabled: true, pct: 5 })) && !(await cfgOk({ ...D, ends_days_before: 15 })));
ok("config sem pix_discount continua válida", (await sv("select public.billing_config_ok((select value - 'pix_discount' from platform_settings where key='billing_config')) r")).rows[0].r === true);

// ---- cenário
let seq = 0;
async function house() {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0123000-0000-0000-0000-00000000${hex}`, H = `d0123000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `h${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'maximo')", [H, O, `Casa ${i}`, `casa-t-${i}`]);
  return { O, H };
}
const issue = async (H, due, desc = "Mensalidade do plano", amount = 10000, kind = "plan") => {
  const r = await sv("select public.platform_charge_issue($1,$2,$3,$4::bigint,current_date+$5::int,current_date-$8::int,$6,$7) id", [H, kind, kind === "plan" ? "plan:maximo" : "p80", amount, due, desc, `v0123-key-${++seq}`, seq + 100]);
  if (r.err) throw new Error(r.err);
  return r.rows[0].id;
};
const ch = async (id) => (await sv("select * from platform_charges where id=$1", [id])).rows[0];
const SP = (await sv("select (now() at time zone 'America/Sao_Paulo')::date d")).rows[0].d;
const iso = (d, add = 0) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + add); return x.toISOString().slice(0, 10); };
let n = 0; const ref = () => `cs_0123_${++n}`;
const attach = (id, r, method, amount) => sv("select public.platform_charge_attach($1,'stripe',$2,$3,null,$4::bigint)", [id, r, method, amount ?? null]);
const confirm = (r, paid, fee = null) => sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,$3::bigint) r", [r, paid, fee]);

const { H, O } = await house();
// desligado
let id = await issue(H, 7);
ok("desconto desligado: fatura sem desconto", (await ch(id)).pix_discount_cents === "0" || Number((await ch(id)).pix_discount_cents) === 0);
// ligado
await setCfg(D);
id = await issue(H, 7);
let c = await ch(id);
ok("ligado: mensalidade guarda 5% (R$ 5,00 de R$ 100,00) e o prazo é a véspera", Number(c.pix_discount_cents) === 500 && iso(c.pix_discount_until) === iso(SP, 6), JSON.stringify([c.pix_discount_cents, c.pix_discount_until]));
let nt = (await sv("select text from notifications where user_id=$1 order by created_at desc limit 1", [O])).rows[0]?.text ?? "";
ok("aviso da fatura cita Pix, data e 5%", /Pague com Pix até \d\d\/\d\d e ganhe 5% de desconto/.test(nt), nt);
ok("outras cobranças não ganham desconto (upgrade, pacote, vaga extra)", Number((await ch(await issue(H, 7, "Upgrade do plano (diferença proporcional)"))).pix_discount_cents) === 0 && Number((await ch(await issue(H, 7, "Pacote de 80 respostas da assistente", 1990, "credit_pack"))).pix_discount_cents) === 0);
ok("vence hoje: sem janela (a véspera já passou)", Number((await ch(await issue(H, 0))).pix_discount_cents) === 0);
ok("vence amanhã: último dia do desconto é hoje", Number((await ch(await issue(H, 1))).pix_discount_cents) === 500);
await setCfg({ ...D, ends_days_before: 0 });
ok("prazo 0: vale até o dia do vencimento", iso((await ch(await issue(H, 3))).pix_discount_until) === iso(SP, 3));
await setCfg({ ...D, pct: 20 });
ok("percentual vem da configuração", Number((await ch(await issue(H, 9))).pix_discount_cents) === 2000);
await setCfg(D);

// ---- valor a pagar por meio
const pay = async (cid, method, now = null) => Number((await sv("select public.platform_charge_payable($1,$2,coalesce($3::timestamptz, now())) v", [cid, method, now])).rows[0].v);
ok("payable: Pix = 9500, cartão = 10000, sem meio = 10000", (await pay(id, "pix")) === 9500 && (await pay(id, "card")) === 10000 && (await pay(id, null)) === 10000 && (await pay(id, "card_recurring")) === 10000);
ok("payable: depois do prazo o Pix volta ao valor cheio", (await pay(id, "pix", iso(SP, 7) + "T15:00:00Z")) === 10000);

// ---- guardar a página de pagamento
let r1 = ref();
let r = await attach(id, r1, "pix", 9500);
ok("attach Pix com valor descontado funciona", !r.err, r.err);
ok("a referência guarda o valor pedido", Number((await sv("select amount_cents from platform_charge_refs where ref=$1", [r1])).rows[0].amount_cents) === 9500);
ok("attach recusa valor qualquer (9400, 9999, 0, negativo)", (await (async () => { const o = []; for (const a of [9400, 9999, 0, -500]) o.push(await attach(id, ref(), "pix", a)); return o; })()).every((x) => /valor_invalido/.test(x.err ?? "") || /check/i.test(x.err ?? "")));
ok("attach de cartão com valor descontado é recusado", /valor_invalido/.test((await attach(id, ref(), "card", 9500)).err ?? ""));
ok("attach sem valor = valor cheio (compatível com chamada antiga de 5 argumentos)", !(await sv("select public.platform_charge_attach($1,'stripe',$2,'card',null)", [id, ref()])).err);
const rFull = (await sv("select ref from platform_charge_refs where charge_id=$1 order by id desc limit 1", [id])).rows[0].ref;
// confirmação
ok("confirmar o descontado com valor cheio é recusado", /valor_divergente/.test((await confirm(r1, 10000)).err ?? ""));
ok("confirmar com outro valor é recusado", /valor_divergente/.test((await confirm(r1, 9000)).err ?? "") && /valor_divergente/.test((await confirm(r1, 9501)).err ?? ""));
ok("confirmar o cheio com valor descontado é recusado", /valor_divergente/.test((await confirm(rFull, 9500)).err ?? ""));
ok("tarifa maior que o valor pago é recusada", /tarifa_invalida/.test((await confirm(r1, 9500, 9501)).err ?? ""));
r = await confirm(r1, 9500, 114);
ok("confirmar o descontado com o valor descontado paga a fatura", !r.err && r.rows[0].r.already === false, r.err);
c = await ch(id);
ok("fatura paga: status, valor pago 9500, referência", c.status === "paga" && Number(c.paid_amount_cents) === 9500 && c.paid_ref === r1);
ok("receita lançada = valor pago (9500), tarifa separada", (await sv("select entry_type, amount_cents from platform_ledger_entries where charge_id=$1 order by entry_type", [id])).rows.map((x) => `${x.entry_type}:${x.amount_cents}`).join() === "receita:9500,taxa_provedor:114");
r = await confirm(rFull, 10000);
ok("outra referência da mesma fatura paga depois é marcada como duplicada (não baixa de novo)", !r.err && r.rows[0].r.duplicate === true, r.err);
ok("confirmar de novo a mesma referência é idempotente", (await confirm(r1, 9500)).rows[0].r.already === true);
ok("duplicidade gera registro para devolver", Number((await sv("select count(*)::int n from platform_billing_events where kind='pagamento_duplicado' and charge_id=$1", [id])).rows[0].n) === 1);

// ---- prazo vencido no attach
id = await issue(H, 7);
await sv("set session_replication_role = replica"); await sv("update platform_charges set pix_discount_until = current_date - 2 where id=$1", [id]); await sv("set session_replication_role = origin");
ok("prazo vencido: attach com desconto recusado, cheio aceito", /valor_invalido/.test((await attach(id, ref(), "pix", 9500)).err ?? "") && !(await attach(id, ref(), "pix", 10000)).err);
ok("prazo vencido: payable já devolve o cheio", (await pay(id, "pix")) === 10000);
// referência antiga sem valor (criada antes desta migration)
id = await issue(H, 7);
const rl = ref(); await sv("insert into platform_charge_refs (charge_id, provider, ref, amount_cents) values ($1,'stripe',$2,null)", [id, rl]);
ok("referência antiga sem valor: vale o valor cheio", Number((await sv("select public.platform_ref_expected('stripe',$1) v", [rl])).rows[0].v) === 10000 && !(await confirm(rl, 10000)).err);
// fatura cancelada não paga
id = await issue(H, 7); const rc = ref(); await attach(id, rc, "pix", 9500);
await sv("set session_replication_role = replica"); await sv("update platform_charges set status='cancelada' where id=$1", [id]); await sv("set session_replication_role = origin");
ok("fatura cancelada continua recusando pagamento", /cobranca_cancelada/.test((await confirm(rc, 9500)).err ?? ""));
// restrições de tabela
ok("desconto não pode ser igual ou maior que o valor", !!(await sv("update platform_charges set pix_discount_cents = amount_cents where id=$1", [id])).err);
// permissões
const priv = async (role, sig) => (await su.query("select has_function_privilege($1,$2,'execute') x", [role, sig])).rows[0].x;
ok("funções novas só para o servidor (service_role)", !(await priv("anon", "public.platform_charge_payable(uuid,text,timestamptz)")) && !(await priv("authenticated", "public.platform_charge_payable(uuid,text,timestamptz)")) && (await priv("service_role", "public.platform_charge_payable(uuid,text,timestamptz)")) && !(await priv("authenticated", "public.platform_ref_expected(text,text)")) && !(await priv("authenticated", "public.platform_charge_attach(uuid,text,text,text,text,bigint)")) && !(await priv("anon", "public.platform_pix_discount(bigint,date)")));
console.log(`\n${total - bad}/${total} aprovados`); await su.end(); process.exit(bad ? 1 : 0);
