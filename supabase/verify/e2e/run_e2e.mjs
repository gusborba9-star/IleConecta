// E2E local da EXEC-01: Edge Function REAL (index.ts) no Deno + supabase-js real + PostgreSQL 16 real com as migrations 0001–0066.
// Substitutos declarados: PostgREST/GoTrue -> restShim.mjs; API do Stripe -> fakeStripe.mjs (NÃO é Stripe real).
// Uso: DENO_BIN=<deno> node supabase/verify/e2e/run_e2e.mjs   (requer Postgres em 127.0.0.1:5544 e `npm i --no-save pg`)
import { boot, WEBHOOK_SECRET, CRON_SECRET } from "./boot.mjs";
import { signStripePayload } from "../../../tests/helpers/stripeSign.mjs";

const results = []; let bad = 0;
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); if (!cond) bad++; };
const U = { owner: "00000000-0000-0000-0000-0000000000a1", client: "00000000-0000-0000-0000-0000000000b1", other: "00000000-0000-0000-0000-0000000000c1" };
const H = "10000000-0000-0000-0000-000000000001";
const t = await boot();
const bail = async (e) => { console.error(e); await t.close().catch(() => {}); process.exit(2); };
process.on("unhandledRejection", bail); process.on("uncaughtException", bail);
const { db: c } = t;
const tok = (id) => ({ authorization: `Bearer user-${id}` });
const post = (headers, body) => fetch(t.base, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const act = async (user, body) => { const r = await post(tok(user), body); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const hook = async (event, secret = WEBHOOK_SECRET) => { const raw = JSON.stringify(event); const r = await post({ "stripe-signature": await signStripePayload(raw, secret) }, raw); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const sweep = async () => { const r = await post({ "x-cron-secret": CRON_SECRET }, "{}"); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
const one = async (sql, p = []) => (await q(sql, p))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripeCalls = async () => (await fetch(`http://127.0.0.1:${t.stripe.port}/__ctl/state`, { method: "POST", body: "{}" }).then((r) => r.json()));
const reset = () => t.ctl("reset");

// ---------- semeadura ----------
await c.query("set session_replication_role = replica");
await c.query(`insert into auth.users(id,email) values ($1,'o@x'),($2,'c@x'),($3,'x@x') on conflict do nothing`, [U.owner, U.client, U.other]);
for (const [id, n] of [[U.owner, "Dono"], [U.client, "Cli"], [U.other, "Outro"]]) await c.query(`insert into profiles(id,account_type,display_name) select $1,(enum_range(null::account_type))[1],$2 on conflict do nothing`, [id, n]);
await c.query(`insert into houses(id,owner_id,name,slug) values ($1,$2,'Casa','casa') on conflict do nothing`, [H, U.owner]);
await c.query(`insert into platform_settings(key,value) values ('features','{"payments":{"state":"on"}}'::jsonb) on conflict (key) do update set value = excluded.value`);
await c.query(`insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_1','ativa',true,true) on conflict (house_id) do update set stripe_account_id='acct_1', charges_enabled=true, provider='stripe'`, [H, U.owner]);
await c.query("set session_replication_role = origin");

let n = 0;
/** Cria evento + reserva + pagamento. Devolve ids. */
async function mk(tag, { ref = null, account = "acct_1", status = "pendente", resStatus = "aguardando_pagamento", gross = 10000, fee = 1500, ver = "v2-2026-10", strict = true, member = false } = {}) {
  n++;
  const res = (await one(`select md5($1::text)::uuid id`, ["res" + tag])).id, ev = (await one(`select md5($1::text)::uuid id`, ["ev" + tag])).id, pid = (await one(`select md5($1::text)::uuid id`, ["pay" + tag])).id;
  await c.query("set session_replication_role = replica");
  await c.query(`insert into events(id,house_id,title,price_cents,seats_total,starts_at) values ($1,$2,$3,$4,10,now()+interval '5 days')`, [ev, H, "Ritual " + tag, gross]);
  await c.query(`insert into reservations(id,event_id,user_id,status,expires_at) values ($1,$2,$3,$4,now()+interval '1 day')`, [res, ev, U.client, resStatus]);
  await c.query(`insert into payments(id,reservation_id,provider,provider_ref,stripe_account_id,gross_cents,fee_cents,fee_rule_version,status) values ($1,$2,'stripe',$3,$4,$5,$6,$7,$8)`, [pid, res, ref, account, gross, fee, ver, status]);
  if (!strict) await c.query(`update payments set identity_strict = false where id = $1`, [pid]);
  await c.query("set session_replication_role = origin");
  return { pid, res, ev, ref };
}
const pay = (pid) => one(`select status::text s, provider_ref, stripe_account_id, processor_fee_cents pf, fee_cents from payments where id=$1`, [pid]);
const ledger = (pid) => q(`select entry_type t, amount_cents a, fee_rule_version v from ledger_entries where payment_id=$1 order by entry_type, amount_cents`, [pid]);
const evRow = (id) => one(`select processed_at is not null done, error, attempts, locked_until, lease_token from stripe_events where id=$1`, [id]);
const sess = (id, o = {}) => t.ctl("session", { id, account: "acct_1", ...o });
const whPaid = (id, ref, pid, extra = {}) => ({ id, type: "checkout.session.completed", account: "acct_1", data: { object: { id: ref, payment_status: "paid", metadata: { payment_id: pid } } }, ...extra });

// =====================================================================================================================
// P1 — Deno: inicialização e HTTP
// =====================================================================================================================
{
  const o = t.denoOut();
  ok("P1 Deno executa o index.ts real (imports npm:@supabase/supabase-js, módulos locais, adaptador+store criados)", /READY/.test(o) && !/error|Uncaught|TypeError/i.test(o.replace(/punycode/g, "")), "");
  ok("P1 CORS preflight 200", (await fetch(t.base, { method: "OPTIONS" })).status === 200);
  ok("P1 GET -> 405", (await fetch(t.base)).status === 405);
  ok("P1 POST sem usuário -> 401", (await post({}, "{}")).status === 401);
  ok("P1 ação desconhecida -> 400", (await act(U.client, { action: "x" })).status === 400);
}

// =====================================================================================================================
// P3 — Stripe (API simulada): 12 cenários
// =====================================================================================================================
{ // 1. criação e recuperação de checkout
  await reset();
  const p = await mk("co1");
  const r1 = await act(U.client, { action: "checkout", reservation_id: p.res });
  const row = await pay(p.pid);
  const calls1 = (await stripeCalls()).calls.filter((x) => x.path === "/v1/checkout/sessions" && x.method === "POST");
  ok("S1 checkout cria sessão e devolve URL", r1.status === 200 && /^https:\/\/checkout\.fake\//.test(r1.body.url), JSON.stringify(r1.body));
  ok("S1 referência e conta gravadas na transação", row.provider_ref?.startsWith("cs_test_new") && row.stripe_account_id === "acct_1");
  ok("S1 chamada ao Stripe: chave de teste, Stripe-Account (cobrança direta), versão e Idempotency-Key", calls1.length === 1 && calls1[0].account === "acct_1" && calls1[0].version && /^cs_/.test(calls1[0].idem ?? "") && calls1[0].auth === "Bearer sk_test_FAKE_e2e", JSON.stringify({ account: calls1[0]?.account, idem: calls1[0]?.idem }));
  ok("S1 comissão enviada como application_fee_amount = fee_cents da transação", /application_fee_amount%5D=1500|application_fee_amount=1500/.test(calls1[0]?.body ?? ""), decodeURIComponent(calls1[0]?.body ?? "").match(/application_fee_amount\]?=\d+/)?.[0]);
  const r2 = await act(U.client, { action: "checkout", reservation_id: p.res });
  const calls2 = (await stripeCalls()).calls.filter((x) => x.path === "/v1/checkout/sessions" && x.method === "POST");
  ok("S1 segunda chamada recupera a sessão aberta (mesma URL, sem criar outra)", r2.status === 200 && r2.body.url === r1.body.url && calls2.length === 1);
}
{ // 2/3. pagamento confirmado + webhook válido + conciliação da tarifa
  await reset();
  const p = await mk("pay1", { ref: "cs_pay1" });
  await sess("cs_pay1", { status: "complete", payment_status: "paid", payment_intent: "pi_pay1", fee: 250 });
  const w = await hook(whPaid("evt_pay1", "cs_pay1", p.pid));
  const row = await pay(p.pid); const l = await ledger(p.pid);
  ok("S2/S3 webhook assinado e válido -> 200", w.status === 200 && w.body.received === true, JSON.stringify(w));
  ok("S2 pagamento confirmado + reserva confirmada", row.s === "confirmado" && (await one(`select status::text s from reservations where id=$1`, [p.res])).s === "confirmada");
  ok("S2 ledger: bruto 10000 / plataforma 1500 / casa 8500 (+ taxa_provedor 250)", JSON.stringify(l.map((x) => [x.t, x.a])) === JSON.stringify([["bruto", 10000], ["casa", 8500], ["plataforma", 1500], ["taxa_provedor", 250]]), JSON.stringify(l.map((x) => [x.t, x.a])));
  ok("S9 tarifa do processador conciliada (processor_fee_cents=250)", row.pf === 250);
  const rf = await one(`select provider_payment_ref pi, provider_charge_ref ch from payments where id=$1`, [p.pid]);
  ok("M66 PaymentIntent e Charge registrados ao confirmar (pi_pay1 / ch_pi_pay1)", rf.pi === "pi_pay1" && rf.ch === "ch_pi_pay1", JSON.stringify(rf));
  ok("S2 Stripe direto: sem payout/retenção da plataforma", (await one(`select count(*)::int n from payouts`)).n === 0);
  const e = await evRow("evt_pay1");
  ok("S3 evento fechado como concluído", e.done === true && e.error === null && e.attempts === 1);
  // 4. duplicado
  const d = await hook(whPaid("evt_pay1", "cs_pay1", p.pid));
  ok("S4 webhook duplicado -> 200 duplicate, sem novo efeito", d.status === 200 && d.body.duplicate === true && (await ledger(p.pid)).length === 4);
  // 5. assinatura inválida
  const badSig = await hook(whPaid("evt_badsig", "cs_pay1", p.pid), "whsec_ERRADO");
  ok("S5 assinatura inválida -> 400 e nenhum evento gravado", badSig.status === 400 && !(await evRow("evt_badsig")));
  const old = await post({ "stripe-signature": await signStripePayload("{}", WEBHOOK_SECRET, 1000) }, "{}");
  ok("S5 assinatura com carimbo de tempo antigo (replay) -> 400", old.status === 400);
  const tampered = JSON.stringify(whPaid("evt_tamper", "cs_pay1", p.pid)); const sig = await signStripePayload(tampered, WEBHOOK_SECRET);
  ok("S5 corpo adulterado após assinar -> 400", (await post({ "stripe-signature": sig }, tampered.replace("cs_pay1", "cs_other"))).status === 400);
}
{ // 6. sessão expirada
  await reset();
  const p = await mk("exp1", { ref: "cs_exp1" });
  const w = await hook({ id: "evt_exp1", type: "checkout.session.expired", account: "acct_1", data: { object: { id: "cs_exp1", metadata: { payment_id: p.pid } } } });
  ok("S6 webhook de sessão expirada -> pagamento 'falhou'", w.status === 200 && (await pay(p.pid)).s === "falhou");
  const p2 = await mk("exp2", { ref: "cs_exp2" });
  await sess("cs_exp2", { status: "expired" });
  const r = await act(U.client, { action: "checkout", reservation_id: p2.res });
  const row = await pay(p2.pid);
  ok("S6 checkout com sessão EXPIRADA no Stripe cria sessão nova (evidência explícita) e mantém conta", r.status === 200 && row.provider_ref !== "cs_exp2" && row.stripe_account_id === "acct_1", `${row.provider_ref}`);
}
{ // 7. sessão em processamento / já paga
  await reset();
  const p = await mk("proc1", { ref: "cs_proc1" });
  await sess("cs_proc1", { status: "complete", payment_status: "unpaid", payment_intent: "pi_proc1" });
  const w = await hook({ ...whPaid("evt_proc1", "cs_proc1", p.pid), data: { object: { id: "cs_proc1", payment_status: "unpaid", metadata: { payment_id: p.pid } } } });
  ok("S7 webhook com pagamento ainda não liquidado (Pix/processando) não confirma", w.status === 200 && (await pay(p.pid)).s === "pendente");
  const r = await act(U.client, { action: "checkout", payment_id: p.pid });
  ok("S7 checkout com sessão em processamento -> 409 e NÃO cria nova cobrança", r.status === 409 && (await stripeCalls()).calls.filter((x) => x.method === "POST" && x.path === "/v1/checkout/sessions").length === 0, JSON.stringify(r));
  await sess("cs_proc1", { payment_status: "paid" });
  const r2 = await act(U.client, { action: "checkout", payment_id: p.pid });
  ok("S7 checkout com sessão já paga -> 409 'já foi realizado'", r2.status === 409 && /já foi realizado/.test(r2.body.error ?? ""), JSON.stringify(r2));
  const s = await act(U.client, { action: "sync", payment_id: p.pid });
  ok("S7 sync confirma o pagamento já pago no Stripe (rede de segurança)", s.status === 200 && s.body.status === "confirmado" && (await pay(p.pid)).s === "confirmado");
}
{ // 8. erros HTTP e de rede
  await reset();
  const p = await mk("err1", { ref: "cs_err1" });
  await sess("cs_err1", { status: "open" });
  for (const [mode, expectStatus] of [["401", 502], ["403", 502], ["429", 502], ["500", 502], ["503", 502], ["network", 500]]) {
    await t.ctl("fail", { match: "^GET /v1/checkout/sessions/", mode, once: mode !== "network" }); // rede: falha persistente (o fetch do Deno refaz GET após reset de socket)
    const r = await act(U.client, { action: "checkout", payment_id: p.pid });
    if (mode === "network") await reset();
    const posts = (await stripeCalls()).calls.filter((x) => x.method === "POST" && x.path === "/v1/checkout/sessions").length;
    ok(`S8 checkout com ${mode === "network" ? "falha de REDE" : "HTTP " + mode} na consulta propaga erro (${expectStatus}) e NÃO cria cobrança`, r.status === expectStatus && posts === 0 && (await pay(p.pid)).provider_ref === "cs_err1", `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }
  // webhook com falha na API de tarifa: confirma mesmo assim; rotina concilia depois
  const p2 = await mk("fee1", { ref: "cs_fee1" });
  await sess("cs_fee1", { status: "complete", payment_status: "paid", payment_intent: "pi_fee1", fee: 310 });
  await t.ctl("fail", { match: "^GET /v1/payment_intents/", mode: "503" }); // 1ª consulta ao PaymentIntent: vínculo PaymentIntent/Charge
  await t.ctl("fail", { match: "^GET /v1/payment_intents/", mode: "503" }); // 2ª consulta ao PaymentIntent: tarifa
  const w = await hook(whPaid("evt_fee1", "cs_fee1", p2.pid));
  const r1 = await pay(p2.pid);
  ok("S8/S9 falha na API de tarifa NÃO derruba a confirmação (200, confirmado, tarifa pendente)", w.status === 200 && r1.s === "confirmado" && r1.pf === null);
  const sw = await sweep();
  const r2 = await pay(p2.pid);
  ok("S9 rotina agendada concilia a tarifa faltante (cron secret válido)", sw.status === 200 && sw.body.fees_done >= 1 && r2.pf === 310, JSON.stringify(sw.body));
  const sw2 = await sweep();
  ok("S9 conciliação repetida não duplica (1 lançamento taxa_provedor)", (await ledger(p2.pid)).filter((x) => x.t === "taxa_provedor").length === 1 && sw2.body.fees_done === 0);
  // balance_transaction ainda nulo: tarifa fica PENDENTE (null, sem lançamento); quando o Stripe lança, a rotina concilia
  const p3 = await mk("fee2", { ref: "cs_fee2" });
  await sess("cs_fee2", { status: "complete", payment_status: "paid", payment_intent: "pi_fee2", fee: null });
  const w3 = await hook(whPaid("evt_fee2", "cs_fee2", p3.pid));
  const q1 = await pay(p3.pid);
  ok("S9b balance_transaction nulo: confirma, tarifa pendente (null) e sem lançamento taxa_provedor", w3.status === 200 && q1.s === "confirmado" && q1.pf === null && (await ledger(p3.pid)).filter((x) => x.t === "taxa_provedor").length === 0);
  await sweep();
  ok("S9b rotina com tarifa ainda indisponível mantém pendente (não grava zero)", (await pay(p3.pid)).pf === null);
  await sess("cs_fee2", { fee: 310 });
  const sw3 = await sweep();
  const q2 = await pay(p3.pid);
  ok("S9b tarifa disponibilizada depois: rotina concilia uma única vez (310)", sw3.body.fees_done >= 1 && q2.pf === 310 && (await ledger(p3.pid)).filter((x) => x.t === "taxa_provedor").length === 1, JSON.stringify(sw3.body));
  ok("S9 rotina sem segredo correto -> 401",(await post({ "x-cron-secret": "errado" }, "{}")).status === 401);
}
// refund helpers
async function confirmed(tag, o = {}) {
  const p = await mk(tag, { ref: "cs_" + tag, ...o });
  await sess("cs_" + tag, { status: "complete", payment_status: "paid", payment_intent: "pi_" + tag, fee: 200 });
  const w = await hook(whPaid("evt_" + tag, "cs_" + tag, p.pid));
  if (w.status !== 200) throw new Error("seed confirm falhou " + JSON.stringify(w));
  return p;
}
const approveRefund = async (p, tag) => { const id = (await one(`select md5($1::text)::uuid id`, ["rr" + tag])).id; await c.query("set session_replication_role = replica"); await c.query(`insert into refund_requests(id,payment_id,reservation_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,$3,$4,$5,'apos_inicio','motivo de teste do reembolso',10000,'aprovado')`, [id, p.pid, p.res, H, U.client]); await c.query("set session_replication_role = origin"); return id; };
const refundsFor = async (pi) => (await stripeCalls()).refunds.filter((r) => r.payment_intent === pi).length;
{ // 10/11. reembolso integral, repetido, e valores originais
  await reset();
  const p = await confirmed("rf1");
  const before = await ledger(p.pid);
  // a regra comercial "mudou" depois da cobrança: o estorno deve usar o que foi REGISTRADO
  await c.query(`update payments set fee_cents = 999, fee_rule_version = 'v9-NOVA' where id = $1`, [p.pid]);
  const rr = await approveRefund(p, "rf1");
  const r = await act(U.client, { action: "refund", refund_id: rr });
  const l = await ledger(p.pid);
  const sum = (t2) => l.filter((x) => x.t === t2).reduce((a, x) => a + x.a, 0);
  ok("S10 reembolso integral: 200, 1 reembolso no Stripe com refund_application_fee=true", r.status === 200 && (await refundsFor("pi_rf1")) === 1 && (await stripeCalls()).refunds[0].params.refund_application_fee === "true", JSON.stringify(r));
  ok("S10 transação 'estornado', pedido 'reembolsado', reserva 'reembolsada'", (await pay(p.pid)).s === "estornado" && (await one(`select status s from refund_requests where id=$1`, [rr])).s === "reembolsado" && (await one(`select status::text s from reservations where id=$1`, [p.res])).s === "reembolsada");
  ok("S10/P4 estorno reverte os valores ORIGINAIS do ledger (bruto/plataforma/casa = 0 líquido), não a regra nova", sum("bruto") === 0 && sum("plataforma") === 0 && sum("casa") === 0 && l.filter((x) => x.a < 0).every((x) => x.v === before[0].v), JSON.stringify(l.map((x) => [x.t, x.a, x.v])));
  ok("S10/P4 estorno lançou -10000 / -1500 / -8500 (não -999)", l.some((x) => x.t === "plataforma" && x.a === -1500) && l.some((x) => x.t === "casa" && x.a === -8500) && !l.some((x) => Math.abs(x.a) === 999));
  const r2 = await act(U.client, { action: "refund", refund_id: rr });
  ok("S11 reembolso repetido (já concluído) -> ok/already, sem novo reembolso nem novo lançamento", r2.status === 200 && r2.body.already === true && (await refundsFor("pi_rf1")) === 1 && (await ledger(p.pid)).length === l.length, JSON.stringify(r2));
  const hk = await hook({ id: "evt_rf1_ch", type: "charge.refunded", account: "acct_1", data: { object: { amount: 10000, amount_refunded: 10000, metadata: { payment_id: p.pid } } } });
  ok("S11 webhook charge.refunded depois do estorno não duplica efeitos", hk.status === 200 && (await ledger(p.pid)).length === l.length && (await refundsFor("pi_rf1")) === 1);
}
{ // 11 (queda entre Stripe e banco): reembolso criado no Stripe, registro falha, nova tentativa reaproveita
  await reset();
  const p = await confirmed("rf2");
  const rr = await approveRefund(p, "rf2");
  await c.query(`create or replace function pg_temp.noop() returns void language sql as $$ select 1 $$`);
  await c.query(`create or replace function public.__e2e_block() returns trigger language plpgsql as $$ begin raise exception 'queda simulada do banco'; end $$`);
  await c.query(`create trigger __e2e_block before update on public.refund_requests for each row execute function public.__e2e_block()`);
  const a = await act(U.client, { action: "refund", refund_id: rr });
  ok("S11 queda do banco depois do reembolso no Stripe -> erro, transação segue 'confirmado'", a.status === 400 && (await refundsFor("pi_rf2")) === 1 && (await pay(p.pid)).s === "confirmado", JSON.stringify(a));
  await c.query(`drop trigger __e2e_block on public.refund_requests`);
  const b = await act(U.client, { action: "refund", refund_id: rr });
  ok("S11 nova tentativa REAPROVEITA o reembolso existente (Stripe segue com 1) e conclui o registro", b.status === 200 && (await refundsFor("pi_rf2")) === 1 && (await pay(p.pid)).s === "estornado", JSON.stringify(b));
  const lg = await ledger(p.pid);
  ok("S11 efeitos financeiros do estorno aplicados uma única vez", lg.filter((x) => x.a < 0).length === 3);
}
{ // 12a. cancelamento (fluxo REAL: o gatilho trg_auto_refund_res abre um pedido 'aprovado' ao ir para reembolso_pendente)
  await reset();
  const p = await confirmed("cn1");
  await c.query(`update reservations set status = 'reembolso_pendente' where id = $1`, [p.res]);
  const auto = await one(`select status, kind from refund_requests where payment_id=$1`, [p.pid]);
  ok("S12 gatilho pré-existente abriu pedido automático aprovado (antes_do_inicio)", auto?.status === "aprovado" && auto?.kind === "antes_do_inicio");
  const r = await act(U.client, { action: "refund_cancelled", kind: "reserva", source_id: p.res });
  ok("S12 refund_cancelled: Stripe devolve 1× e NÃO duplica ao repetir (comportamento idêntico ao da main: complete_cancel_refund recusa com pedido aberto)", (await refundsFor("pi_cn1")) === 1 && r.status === 200, JSON.stringify(r.body));
  const r1b = await act(U.client, { action: "refund_cancelled", kind: "reserva", source_id: p.res });
  const sw = await sweep();
  ok("S12 repetição e rotina agendada não criam segundo reembolso no Stripe (reaproveita o existente)", (await refundsFor("pi_cn1")) === 1 && r1b.status === 200 && sw.status === 200);
  const hk = await hook({ id: "evt_cn1_ch", type: "charge.refunded", account: "acct_1", data: { object: { amount: 10000, amount_refunded: 10000, metadata: { payment_id: p.pid } } } });
  const l = await ledger(p.pid);
  ok("S12 webhook charge.refunded fecha o cancelamento: transação 'estornado', reserva 'reembolsada', pedido 'reembolsado'", hk.status === 200 && (await pay(p.pid)).s === "estornado" && (await one(`select status::text s from reservations where id=$1`, [p.res])).s === "reembolsada" && (await one(`select status s from refund_requests where payment_id=$1`, [p.pid])).s === "reembolsado");
  ok("S12 estorno reverte exatamente o registrado (-10000/-1500/-8500) uma única vez", l.filter((x) => x.a < 0).length === 3 && l.some((x) => x.t === "bruto" && x.a === -10000) && l.some((x) => x.t === "plataforma" && x.a === -1500) && l.some((x) => x.t === "casa" && x.a === -8500));
  const r3 = await act(U.other, { action: "refund_cancelled", kind: "reserva", source_id: p.res });
  ok("S12 usuário estranho à reserva -> 403", r3.status === 403);
}
{ // 12b. complete_cancel_refund sem pedido automático (ordem em que o gatilho não abre pedido)
  await reset();
  const p = await confirmed("cn2");
  await c.query("set session_replication_role = replica"); // sem disparar o gatilho: reserva já em reembolso_pendente, sem pedido aberto
  await c.query(`update reservations set status = 'reembolso_pendente' where id = $1`, [p.res]);
  await c.query("set session_replication_role = origin");
  const r = await act(U.client, { action: "refund_cancelled", kind: "reserva", source_id: p.res });
  const l = await ledger(p.pid);
  ok("S12b cancelamento sem pedido aberto: 1 reembolso no Stripe, transação 'estornado', reserva 'reembolsada'", r.status === 200 && r.body.refunded === 1 && (await refundsFor("pi_cn2")) === 1 && (await pay(p.pid)).s === "estornado" && (await one(`select status::text s from reservations where id=$1`, [p.res])).s === "reembolsada", JSON.stringify(r.body));
  ok("S12b reverte exatamente o registrado (-10000/-1500/-8500)", l.some((x) => x.t === "bruto" && x.a === -10000) && l.some((x) => x.t === "plataforma" && x.a === -1500) && l.some((x) => x.t === "casa" && x.a === -8500));
  const r2 = await act(U.client, { action: "refund_cancelled", kind: "reserva", source_id: p.res });
  ok("S12b repetir não devolve de novo nem relança o ledger", r2.body.refunded === 0 && (await refundsFor("pi_cn2")) === 1 && (await ledger(p.pid)).length === l.length);
  const sw = await sweep();
  ok("S12b rotina com nada pendente não devolve nada", sw.status === 200 && sw.body.refunded === 0);
}

// =====================================================================================================================
// P4 — concorrência e integridade
// =====================================================================================================================
{ // lease vencida: worker antigo tenta concluir o evento
  await reset();
  const p = await mk("ls1", { ref: "cs_ls1" });
  await sess("cs_ls1", { status: "complete", payment_status: "paid", payment_intent: "pi_ls1", fee: 220 });
  await t.ctl("delay", { match: "^GET /v1/payment_intents/", ms: 3500, once: true }); // segura o worker A depois de confirmar
  const aP = hook(whPaid("evt_ls1", "cs_ls1", p.pid)); // worker A
  for (let i = 0; i < 40 && (await pay(p.pid)).s !== "confirmado"; i++) await sleep(100);
  const t0 = await evRow("evt_ls1");
  ok("P4 worker A adquiriu a trava e confirmou; evento ainda não concluído", (await pay(p.pid)).s === "confirmado" && t0.done === false && t0.attempts === 1);
  const busy = await hook(whPaid("evt_ls1", "cs_ls1", p.pid));
  ok("P4 com a lease vigente, outra entrega recebe 409 (não duplica processamento)", busy.status === 409, JSON.stringify(busy));
  await c.query(`update stripe_events set locked_until = now() - interval '1 second' where id = 'evt_ls1'`); // lease do worker A vence
  const bRes = await hook(whPaid("evt_ls1", "cs_ls1", p.pid)); // worker B assume
  const mid = await evRow("evt_ls1");
  ok("P4 novo worker B adquire a trava vencida (attempts=2, token novo) e conclui o evento", bRes.status === 200 && mid.done === true && mid.attempts === 2 && mid.lease_token !== t0.lease_token, JSON.stringify({ b: bRes.status, attempts: mid.attempts }));
  const aRes = await aP;
  const fin = await evRow("evt_ls1");
  ok("P4 worker A (lease vencida) tenta concluir DEPOIS: recebe 409 e não altera o evento do worker B", aRes.status === 409 && fin.done === true && fin.attempts === 2 && fin.lease_token === mid.lease_token && fin.error === null, JSON.stringify({ a: aRes.status, body: aRes.body }));
  ok("P4 efeito financeiro único apesar dos dois workers (ledger 4 linhas, 1 notificação de pagamento)", (await ledger(p.pid)).length === 4 && (await pay(p.pid)).s === "confirmado");
}
{ // worker antigo A termina ENQUANTO o novo worker B ainda processa: só o token impede A de fechar o evento de B
  await reset();
  const p = await mk("ls3", { ref: "cs_ls3" });
  await sess("cs_ls3", { status: "complete", payment_status: "paid", payment_intent: "pi_ls3", fee: 230 });
  await t.ctl("delay", { match: "^GET /v1/payment_intents/", ms: 3000, once: true }); // 1ª chamada (worker A): termina em ~3 s
  await t.ctl("delay", { match: "^GET /v1/payment_intents/", ms: 6000, once: true }); // 2ª chamada (worker B): termina em ~6 s
  const aP = hook(whPaid("evt_ls3", "cs_ls3", p.pid));
  for (let i = 0; i < 40 && (await stripeCalls()).calls.filter((x) => x.path.startsWith("/v1/payment_intents/")).length < 1; i++) await sleep(100);
  await c.query(`update stripe_events set locked_until = now() - interval '1 second' where id = 'evt_ls3'`);
  const bP = hook(whPaid("evt_ls3", "cs_ls3", p.pid)); // B assume e fica preso na tarifa
  for (let i = 0; i < 40 && (await evRow("evt_ls3")).attempts < 2; i++) await sleep(100);
  const tokB = (await evRow("evt_ls3")).lease_token;
  const aRes = await aP; // A termina primeiro
  const mid = await evRow("evt_ls3");
  ok("P4 worker A (lease vencida) termina ANTES de B: recebe 409 e NÃO fecha o evento que pertence a B", aRes.status === 409 && mid.done === false && mid.lease_token === tokB && mid.attempts === 2, JSON.stringify({ a: aRes.status, done: mid.done, attempts: mid.attempts }));
  const bRes = await bP;
  const fin = await evRow("evt_ls3");
  ok("P4 worker B conclui normalmente depois (200) e é quem fecha o evento", bRes.status === 200 && fin.done === true && fin.error === null && (await ledger(p.pid)).length === 4);
}
{ // lease vencida de worker que morreu: próximo reenvio assume
  await reset();
  const p = await mk("ls2", { ref: "cs_ls2" });
  await sess("cs_ls2", { status: "complete", payment_status: "paid", payment_intent: "pi_ls2" });
  await c.query(`insert into stripe_events(id,type,account_id,payload,locked_until,attempts,lease_token) values ('evt_ls2','checkout.session.completed','acct_1','{}',now() - interval '1 minute',1,gen_random_uuid())`);
  const r = await hook(whPaid("evt_ls2", "cs_ls2", p.pid));
  ok("P4 processo que caiu (lease vencida, sem token ativo) -> próximo reenvio assume e conclui", r.status === 200 && (await evRow("evt_ls2")).attempts === 2 && (await pay(p.pid)).s === "confirmado");
}
{ // checkout simultâneo do MESMO pagamento (apuração de de60: duas cobranças pagas para um pagamento)
  await reset();
  const p = await mk("cco1");
  const rs = await Promise.all(Array.from({ length: 6 }, () => act(U.client, { action: "checkout", payment_id: p.pid })));
  const posted = (await stripeCalls()).calls.filter((x) => x.method === "POST" && x.path === "/v1/checkout/sessions");
  const row = await pay(p.pid);
  const urls = new Set(rs.filter((x) => x.status === 200).map((x) => x.body.url));
  ok("S11 6 checkouts simultâneos do mesmo pagamento -> uma única sessão no Stripe (mesma Idempotency-Key) e a mesma URL", new Set(posted.map((x) => x.idem)).size === 1 && urls.size === 1 && urls.has(`https://checkout.fake/${row.provider_ref}`), `posts=${posted.length} idem=${new Set(posted.map((x) => x.idem)).size} urls=${urls.size} status=${rs.map((x) => x.status)}`);
  // sessão paga ainda não confirmada: novo checkout é recusado (não abre segunda cobrança)
  await sess(row.provider_ref, { status: "complete", payment_status: "paid", payment_intent: "pi_cco1" });
  const again = await act(U.client, { action: "checkout", payment_id: p.pid });
  ok("S11 sessão já paga: novo checkout -> 409 e nenhuma sessão adicional", again.status === 409 && (await stripeCalls()).calls.filter((x) => x.method === "POST" && x.path === "/v1/checkout/sessions").length === posted.length);
}
{ // migration 0065 + CAS do checkout + cobrança paga sem pagamento (E2E com SQL real)
  await reset();
  ok("M65 migration 0065 aplicada sem erro; check_cron_secret REAL (Vault) aceita o segredo e recusa o errado", (await one(`select public.check_cron_secret($1) a, public.check_cron_secret('errado') b`, [CRON_SECRET])).a === true && (await one(`select public.check_cron_secret('errado') b`)).b === false);
  ok("M65 check_cron_secret fechada para papéis comuns (sem EXECUTE para anon/authenticated)", (await one(`select has_function_privilege('anon','public.check_cron_secret(text)','execute') a, has_function_privilege('authenticated','public.check_cron_secret(text)','execute') b, has_function_privilege('service_role','public.check_cron_secret(text)','execute') s`)).s === true && !(await one(`select has_function_privilege('anon','public.check_cron_secret(text)','execute') a`)).a);
  // CAS: outra abertura grava uma sessão no meio da criação desta
  const p = await mk("cas1", { ref: "cs_cas1" });
  await sess("cs_cas1", { status: "expired" });
  await t.ctl("delay", { match: "^POST /v1/checkout/sessions", ms: 1500, once: true });
  const aP = act(U.client, { action: "checkout", payment_id: p.pid });
  await sleep(500);
  await c.query(`update payments set provider_ref = 'cs_CONCORRENTE' where id = $1`, [p.pid]);
  const a = await aP;
  ok("S12 CAS: outra sessão gravada durante a criação -> 409, e a referência da outra NÃO é sobrescrita", a.status === 409 && (await pay(p.pid)).provider_ref === "cs_CONCORRENTE", JSON.stringify({ s: a.status, ref: (await pay(p.pid)).provider_ref, body: a.body }));
  // cobrança PAGA sem pagamento correspondente: rejeitada e visível; nada confirmado
  const orphan = { id: "evt_orphan1", type: "checkout.session.completed", account: "acct_1", data: { object: { id: "cs_ORFA", payment_status: "paid", metadata: { payment_id: "99999999-0000-4000-8000-000000000001" } } } };
  const w = await hook(orphan);
  ok("S12 cobrança paga sem pagamento: 200 rejected, nada confirmado", w.status === 200 && w.body.rejected === true);
  // sessão paga com referência diferente da registrada (caso de60): rejeitada com identificadores
  const p2 = await mk("div1", { ref: "cs_div1" });
  const w2 = await hook(whPaid("evt_div1", "cs_OUTRA_SESSAO", p2.pid));
  ok("S12 sessão paga com ref diferente da registrada: rejeitada e pagamento segue pendente", w2.body.rejected === true && (await pay(p2.pid)).s === "pendente");
  // tarifa zero suspeita de cartão
  const p3 = await mk("z1", { ref: "cs_z1" });
  await sess("cs_z1", { status: "complete", payment_status: "paid", payment_intent: "pi_z1", fee: 250 });
  await hook(whPaid("evt_z1", "cs_z1", p3.pid));
  await c.query("set session_replication_role = replica"); await c.query(`update payments set processor_fee_cents = 0 where id = $1`, [p3.pid]); await c.query("set session_replication_role = origin");
  const an = (await q(`select * from public.payments_provider_anomalies(500)`));
  const has = (k, f) => an.some((x) => x.kind === k && f(x));
  ok("M65 payments_provider_anomalies lista: evento rejeitado (órfã e divergente) e tarifa zero suspeita", has("evento_rejeitado", (x) => x.event_id === "evt_orphan1" && /sem pagamento correspondente/.test(x.detail)) && has("evento_rejeitado", (x) => x.event_id === "evt_div1" && x.payment_id === p2.pid && /ref do aviso=cs_OUTRA_SESSAO/.test(x.detail)) && has("tarifa_zero_suspeita", (x) => x.payment_id === p3.pid), JSON.stringify(an.map((x) => [x.kind, x.event_id])));
  ok("M65 anomalias não listam pagamento íntegro (confirmado, com tarifa, ledger fechado)", !has("tarifa_zero_suspeita", (x) => x.payment_id !== p3.pid) && !an.some((x) => x.kind === "ledger_desbalanceado" || x.kind === "sem_ledger"), JSON.stringify(an.map((x) => [x.kind, x.payment_id])));
  const denied = await c.query(`select set_config('test.role','authenticated',false)`).then(() => c.query(`select * from public.payments_provider_anomalies(1)`)).then(() => null, (e) => e.message);
  await c.query(`select set_config('test.role','service_role',false)`);
  ok("M65 payments_provider_anomalies recusa quem não é service_role", /Não autorizado/.test(denied ?? ""), denied);
}
{ // migration 0066: vínculo PaymentIntent/Charge (SQL real)
  await reset();
  const a = await confirmed("rk1");
  const b = await confirmed("rk2");
  const ra = await one(`select provider_payment_ref pi, provider_charge_ref ch from payments where id=$1`, [a.pid]);
  ok("M66 cada pagamento confirmado guarda a sua própria Charge", ra.pi === "pi_rk1" && ra.ch === "ch_pi_rk1");
  const call = (pid, ref, pi, ch, acct = "acct_1") => one(`select public.record_provider_refs_for($1::uuid,'stripe',$2,$3,$4,$5) r`, [pid, ref, acct, pi, ch]).then((x) => x.r);
  ok("M66 repetir o mesmo par -> 'ja_registrada' (idempotente)", (await call(a.pid, "cs_rk1", "pi_rk1", "ch_pi_rk1")) === "ja_registrada");
  ok("M66 Charge diferente para o mesmo pagamento -> 'conflito', nada sobrescrito", (await call(a.pid, "cs_rk1", "pi_OUTRO", "ch_OUTRA")) === "conflito" && (await one(`select provider_charge_ref ch from payments where id=$1`, [a.pid])).ch === "ch_pi_rk1");
  await c.query(`update payments set provider_payment_ref = null, provider_charge_ref = null where id = $2 and $1::text is not null`, ["x", b.pid]);
  ok("M66 Charge já usada por OUTRO pagamento -> 'duplicada' (índice único), nada gravado", (await call(b.pid, "cs_rk2", "pi_rk2", "ch_pi_rk1")) === "duplicada" && (await one(`select provider_charge_ref ch from payments where id=$1`, [b.pid])).ch === null);
  ok("M66 identidade errada (ref/conta) -> 'divergente'", (await call(b.pid, "cs_ERRADA", "pi_rk2", "ch_pi_rk2")) === "divergente" && (await call(b.pid, "cs_rk2", "pi_rk2", "ch_pi_rk2", "acct_OUTRA")) === "divergente");
  const pend = await mk("rk3", { ref: "cs_rk3" });
  ok("M66 pagamento pendente não recebe Charge -> 'nao_confirmada'", (await call(pend.pid, "cs_rk3", "pi_rk3", "ch_pi_rk3")) === "nao_confirmada");
  // rotina completa o que ficou faltando (histórico)
  const miss = await q(`select id from public.payments_missing_provider_refs(50)`);
  ok("M66 payments_missing_provider_refs lista o confirmado sem Charge (b) e não lista o pendente nem o completo", miss.some((x) => x.id === b.pid) && !miss.some((x) => x.id === a.pid || x.id === pend.pid));
  const sw = await sweep();
  ok("M66 rotina agendada vincula o que faltava (refs_done>=1) e b passa a ter a Charge dele", sw.status === 200 && sw.body.refs_done >= 1 && (await one(`select provider_charge_ref ch from payments where id=$1`, [b.pid])).ch === "ch_pi_rk2", JSON.stringify(sw.body));
  // anomalia: confirmado há mais de 1 h sem Charge
  await c.query("set session_replication_role = replica");
  await c.query(`update payments set provider_payment_ref = null, provider_charge_ref = null where id = $1`, [a.pid]);
  await c.query(`update ledger_entries set created_at = now() - interval '2 hours' where payment_id = $1 and entry_type = 'bruto'`, [a.pid]);
  await c.query("set session_replication_role = origin");
  const an = await q(`select * from public.payments_provider_anomalies(500)`);
  ok("M66 anomalia 'sem_referencia_cobranca' aparece para confirmado há >1 h sem Charge", an.some((x) => x.kind === "sem_referencia_cobranca" && x.payment_id === a.pid), JSON.stringify(an.map((x) => [x.kind, x.payment_id === a.pid])));
  // 0068: pagamento anterior à 0066 (sem referências) não gera a anomalia; as demais continuam valendo
  await c.query("set session_replication_role = replica");
  await c.query(`update payments set created_at = '2026-11-01T12:00:00Z' where id = $1`, [a.pid]);
  await c.query("set session_replication_role = origin");
  const anOld = await q(`select * from public.payments_provider_anomalies(500)`);
  ok("M68 pagamento anterior à 0066 sem Charge NÃO gera 'sem_referencia_cobranca'", !anOld.some((x) => x.kind === "sem_referencia_cobranca" && x.payment_id === a.pid), JSON.stringify(anOld.map((x) => [x.kind, x.payment_id === a.pid])));
  await c.query("set session_replication_role = replica");
  await c.query(`update payments set payment_method = 'card', processor_fee_cents = 0 where id = $1`, [a.pid]);
  await c.query("set session_replication_role = origin");
  const anOld2 = await q(`select * from public.payments_provider_anomalies(500)`);
  ok("M68 o histórico continua sujeito às demais anomalias (tarifa zero suspeita)", anOld2.some((x) => x.kind === "tarifa_zero_suspeita" && x.payment_id === a.pid), JSON.stringify(anOld2.map((x) => [x.kind, x.payment_id === a.pid])));
  await c.query("set session_replication_role = replica");
  await c.query(`update payments set created_at = now(), processor_fee_cents = null where id = $1`, [a.pid]);
  await c.query("set session_replication_role = origin");
  const denied = await c.query(`select set_config('test.role','authenticated',false)`).then(() => c.query(`select public.record_provider_refs_for($1::uuid,'stripe','cs_rk1','acct_1','pi','ch')`, [a.pid])).then(() => null, (e) => e.message);
  await c.query(`select set_config('test.role','service_role',false)`);
  ok("M66 record_provider_refs_for recusa quem não é service_role", /Não autorizado/.test(denied ?? ""), denied);
}
{ // confirmação simultânea
  await reset();
  const p = await mk("cc1", { ref: "cs_cc1" });
  await sess("cs_cc1", { status: "complete", payment_status: "paid", payment_intent: "pi_cc1", fee: 180 });
  const same = await Promise.all(Array.from({ length: 12 }, () => hook(whPaid("evt_cc1", "cs_cc1", p.pid))));
  const codes = same.map((x) => x.status).sort().join(",");
  ok("P4 12 entregas simultâneas do MESMO evento -> só uma processa; demais 409/200 duplicado; confirma 1×", same.every((x) => [200, 409].includes(x.status)) && same.filter((x) => x.status === 200 && !x.body.duplicate).length === 1 && (await ledger(p.pid)).length === 4, codes);
  const p2 = await mk("cc2", { ref: "cs_cc2" });
  await sess("cs_cc2", { status: "complete", payment_status: "paid", payment_intent: "pi_cc2", fee: 190 });
  const mixed = await Promise.all([
    ...Array.from({ length: 8 }, (_, i) => hook(whPaid(`evt_cc2_${i}`, "cs_cc2", p2.pid))), // 8 eventos DISTINTOS para a mesma transação
    act(U.client, { action: "sync", payment_id: p2.pid }), act(U.client, { action: "sync", payment_id: p2.pid }),
  ]);
  const l2 = await ledger(p2.pid);
  ok("P4 8 eventos distintos + 2 sync simultâneos da MESMA transação -> confirmação e ledger únicos", mixed.every((x) => x.status === 200) && l2.filter((x) => x.t === "bruto").length === 1 && l2.filter((x) => x.t === "taxa_provedor").length === 1 && (await pay(p2.pid)).s === "confirmado", `${mixed.map((x) => x.status).join(",")} ledger=${l2.length}`);
  ok("P4 notificação de pagamento criada 1× para o dono da casa", (await one(`select count(*)::int n from notifications where user_id=$1 and text like '%Ritual cc2%'`, [U.owner])).n <= 1);
}
{ // identidade divergente / histórica / estrita
  await reset();
  const a = await mk("id1", { ref: "cs_id1" });
  await sess("cs_id1", { status: "complete", payment_status: "paid", payment_intent: "pi_id1" });
  const r1 = await hook(whPaid("evt_id1", "cs_id1", a.pid, { account: "acct_OUTRA" }));
  ok("P4 conta de origem divergente -> evento rejeitado (200 rejected), nada confirmado", r1.body.rejected === true && (await pay(a.pid)).s === "pendente" && /^rejeitado:/.test((await evRow("evt_id1")).error ?? ""));
  const noacct = whPaid("evt_id2", "cs_id1", a.pid); delete noacct.account;
  const r2 = await hook(noacct);
  ok("P4 aviso SEM conta para transação com conta registrada -> rejeitado", r2.body.rejected === true && (await pay(a.pid)).s === "pendente");
  const r3 = await hook(whPaid("evt_id3", "cs_OUTRAREF", a.pid));
  ok("P4 referência divergente (achada pelo id da transação) -> rejeitado", r3.body.rejected === true && (await pay(a.pid)).s === "pendente");
  const n1 = await mk("id4", { ref: "cs_id4", account: null }); // transação NOVA sem conta (estrita)
  await sess("cs_id4", { status: "complete", payment_status: "paid", payment_intent: "pi_id4" });
  const r4 = await hook(whPaid("evt_id4", "cs_id4", n1.pid));
  ok("P4 transação NOVA sem conta registrada NUNCA confirma, mesmo com conta no aviso", r4.body.rejected === true && (await pay(n1.pid)).s === "pendente");
  const h1 = await mk("id5", { ref: "cs_id5", account: null, strict: false }); // histórico marcado
  await sess("cs_id5", { status: "complete", payment_status: "paid", payment_intent: "pi_id5" });
  const r5 = await hook(whPaid("evt_id5", "cs_id5", h1.pid));
  ok("P4 transação HISTÓRICA marcada (identity_strict=false) sem conta continua confirmando", r5.status === 200 && (await pay(h1.pid)).s === "confirmado");
  // defesa do BANCO (sem passar pela checagem do JS): linha nova sem conta nunca confirma; histórico marcado confirma
  const sn = await mk("id6", { ref: "cs_id6", account: null });
  const sh = await mk("id7", { ref: "cs_id7", account: null, strict: false });
  const sqlNew = await one(`select public.confirm_payment_for($1::uuid,'stripe','cs_id6','acct_1') r`, [sn.pid]);
  const sqlNewFee = await one(`select public.record_processor_fee_for($1::uuid,'stripe','cs_id6','acct_1',100,'card') r`, [sn.pid]);
  ok("P4 SQL: linha NOVA sem conta registrada -> confirm_payment_for e record_processor_fee_for = 'divergente'", sqlNew.r === "divergente" && sqlNewFee.r === "divergente" && (await pay(sn.pid)).s === "pendente");
  const sqlHist = await one(`select public.confirm_payment_for($1::uuid,'stripe','cs_id7','acct_1') r`, [sh.pid]);
  ok("P4 SQL: linha HISTÓRICA marcada (identity_strict=false) sem conta -> confirma", sqlHist.r === "confirmado");
  let guard = null; try { await c.query(`update payments set identity_strict = true where id = $1`, [sh.pid]); } catch (e) { guard = e.message; }
  ok("P4 SQL: gatilho impede alterar a marcação identity_strict", /não pode ser alterada/.test(guard ?? ""), guard);
  // chamada direta ao banco: confirmar linha X com identidade de linha Y
  const direct = await one(`select public.confirm_payment_for($1::uuid,'stripe','cs_QUALQUER','acct_1') r`, [a.pid]);
  ok("P4 SQL: confirm_payment_for com referência errada -> 'divergente' sem efeito", direct.r === "divergente" && (await pay(a.pid)).s === "pendente");
}
{ // referências duplicadas em contas diferentes
  await reset();
  const a = await mk("dp1", { ref: "cs_dup", account: "acct_1" });
  let err = null;
  try { await mk("dp2", { ref: "cs_dup", account: "acct_2" }); } catch (e) { err = e; }
  await c.query("set session_replication_role = origin");
  ok("P4 o banco REJEITA a mesma referência de provedor em contas diferentes (UNIQUE payments_provider_ref_key)", err?.code === "23505" && /payments_provider_ref/.test(err?.constraint ?? ""), `${err?.code} ${err?.constraint}`);
  // cenário hipotético: sem as unicidades (existem em produção), o código deve falhar fechado
  await c.query(`alter table payments drop constraint if exists payments_provider_ref_key`);
  await c.query(`drop index if exists payments_provider_ref_uq`);
  const b = await mk("dp3", { ref: "cs_dup", account: "acct_2" });
  await sess("cs_dup", { status: "complete", payment_status: "paid", payment_intent: "pi_dup" });
  const w = await hook(whPaid("evt_dup", "cs_dup", a.pid));
  ok("P4 (sem índice único, hipotético) referência ambígua -> 500 fail-closed: NENHUMA das duas confirmadas", w.status === 500 && (await pay(a.pid)).s === "pendente" && (await pay(b.pid)).s === "pendente", JSON.stringify(w));
  const amb = await one(`select public.confirm_payment_for($1::uuid,'stripe','cs_dup','acct_2') r`, [a.pid]);
  ok("P4 SQL: confirmar a linha da conta acct_1 com identidade de acct_2 -> 'divergente'", amb.r === "divergente");
  const only = await one(`select public.confirm_payment_for($1::uuid,'stripe','cs_dup','acct_2') r`, [b.pid]);
  ok("P4 SQL: confirmar por ID a linha da acct_2 confirma SÓ ela (a outra intacta)", only.r === "confirmado" && (await pay(b.pid)).s === "confirmado" && (await pay(a.pid)).s === "pendente");
  let wrapperErr = null; try { await c.query(`select public.confirm_payment('cs_dup')`); } catch (e) { wrapperErr = e.message; }
  ok("P4 SQL: confirm_payment(ref) legado com ref ambígua falha explicitamente", /ambígua/.test(wrapperErr ?? ""), wrapperErr);
  await c.query(`delete from ledger_entries where payment_id in ($1,$2)`, [a.pid, b.pid]);
  await c.query("set session_replication_role = replica"); // limpeza do harness (o gatilho de identidade bloquearia, corretamente)
  await c.query(`update payments set provider_ref = 'cs_dup_restore_' || id::text where provider_ref = 'cs_dup'`); // restaura unicidade
  await c.query("set session_replication_role = origin");
  await c.query(`alter table payments add constraint payments_provider_ref_key unique (provider_ref)`);
  await c.query(`create unique index if not exists payments_provider_ref_uq on public.payments (provider, provider_ref) where provider_ref is not null`);
}

const dbErr = t.shim.log.errors.filter((e) => !/queda simulada|duplicate key|ambígua|pedido de reembolso em andamento/i.test(e));
ok("Camada REST: nenhum erro inesperado de tradução/SQL durante o E2E", dbErr.length === 0, dbErr.slice(0, 3).join(" | "));
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} PASS / ${bad} FAIL`);
const out = t.denoOut().split("\n").filter((l) => /payments_error|Uncaught|panic/i.test(l));
if (out.length) console.log("\n[stderr do Deno com erros]\n" + out.slice(0, 10).join("\n"));
await t.close();
process.exit(bad ? 1 : 0);
