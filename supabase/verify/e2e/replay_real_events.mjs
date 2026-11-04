// Reprodução LOCAL de eventos REAIS do Stripe (modo teste) contra a Edge Function da EXEC-01 (Deno) + PostgreSQL 16 com 0001–0064.
// Os payloads vêm de `select id, md5(regexp_replace(payload::text,'\s','','g')) h, payload from stripe_events` no banco remoto (somente SELECT).
// O arquivo de payloads NÃO é versionado (contém nome/e-mail de teste): informe-o em REAL_EVENTS=<json>.
// Real: payloads (formato/campos do Stripe), a função, o supabase-js, o PostgreSQL. Substituto: a assinatura é gerada com o segredo local
// (a assinatura original só vale para o segredo do endpoint de produção) e a consulta ao Stripe (sessão/tarifa) é a API simulada.
// Uso: REAL_EVENTS=/caminho/real_events.json DENO_BIN=<deno> node supabase/verify/e2e/replay_real_events.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { boot, WEBHOOK_SECRET } from "./boot.mjs";
import { signStripePayload } from "../../../tests/helpers/stripeSign.mjs";

const fixtures = JSON.parse(readFileSync(process.env.REAL_EVENTS, "utf8"));
const results = []; let bad = 0;
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); if (!cond) bad++; };
const ev = (id) => structuredClone(fixtures.find((f) => f.id === id).payload);
const t = await boot({ db: "replay", port: 18788 });
process.on("unhandledRejection", async (e) => { console.error(e); await t.close().catch(() => {}); process.exit(2); });
const { db: c } = t;
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
const one = async (sql, p = []) => (await q(sql, p))[0];
const post = (headers, body) => fetch(t.base, { method: "POST", headers, body });
const hook = async (event, secret = WEBHOOK_SECRET) => { const raw = JSON.stringify(event); const r = await post({ "stripe-signature": await signStripePayload(raw, secret) }, raw); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const pay = (id) => one(`select status::text s, processor_fee_cents pf, payment_method pm, provider_ref ref from payments where id=$1`, [id]);
const ledger = async (id) => (await q(`select entry_type t, amount_cents::int a, fee_rule_version v from ledger_entries where payment_id=$1 order by entry_type, amount_cents`, [id])).map((x) => `${x.t}:${x.a}`).join(",");
const ord = (id) => one(`select o.status s from service_orders o join payments p on p.order_id=o.id where p.id=$1`, [id]);

// ---- semeadura (espelha as linhas reais: ids, referências, conta, valores, comissão) ----
const U = { owner: "00000000-0000-0000-0000-0000000000a1", client: "00000000-0000-0000-0000-0000000000b1" }, H = "10000000-0000-0000-0000-000000000001";
await c.query("set session_replication_role = replica");
await c.query(`insert into auth.users(id,email) values ($1,'o@x'),($2,'c@x')`, [U.owner, U.client]);
for (const [id, n] of [[U.owner, "Dono"], [U.client, "Cli"]]) await c.query(`insert into profiles(id,account_type,display_name) select $1,(enum_range(null::account_type))[1],$2`, [id, n]);
await c.query(`insert into houses(id,owner_id,name,slug) values ($1,$2,'Casa','casa')`, [H, U.owner]);
await c.query(`insert into platform_settings(key,value) values ('features','{"payments":{"state":"on"}}'::jsonb) on conflict (key) do update set value = excluded.value`);
const ACC = "acct_1UVdX4BgdFFYAjqQ";
async function seed(pid, ref, gross, fee, status = "pendente") {
  const oid = (await one(`select md5($1::text)::uuid id`, ["o" + pid])).id;
  await c.query(`insert into service_orders(id,house_id,client_id,title,price_cents,status,expires_at) values ($1,$2,$3,'Serviço',$4,'aguardando_pagamento', now()+interval '1 day')`, [oid, H, U.client, gross]);
  await c.query(`insert into payments(id,order_id,provider,provider_ref,stripe_account_id,gross_cents,fee_cents,fee_rule_version,status) values ($1,$2,'stripe',$3,$4,$5,$6,'v2-2026-10',$7)`, [pid, oid, ref, ACC, gross, fee, status]);
}
const P = { c8fbc: "8fbc5d2f-ea23-4b6e-b3e0-a5f77a3b317d", c435e: "435e2731-8895-463d-98d7-2d24805e16e3", c07d4: "07d48ce2-2abd-41f2-9293-30f4477c214e", cde60: "de60f127-18c6-46ae-b99f-0d9a7d239527", cba16: "ba16a8cb-c927-455e-a5c6-5f38273fff90", cc297: "c297fc65-28c2-4238-ac63-f4de90c38c2a" };
await seed(P.c8fbc, "cs_test_a1cbimELhjNOHycuSFhf9lTkBh2nCL9MK5c0wraThcZzeVJ5WcUDoXGyKB", 100, 4);
await seed(P.c435e, "cs_test_a1BFVOmVrERfq1JaFRZKAelRA6yadK4huGjXGQIsP7zLpNJ2mw0N1eY7Xq", 20000, 800);
await seed(P.c07d4, "cs_test_a1jhD8vGQjo5S9sVXD8OndqXf9KUa3935ZkvwgKeTrltRx6iR9KTp5ejeC", 100, 4);
await seed(P.cde60, "cs_test_a1vF5vIvR91aUIfUL4PgbrYlhisuMY6gpmr0LAC3S6Qvg3NSQTOwrMzxwc", 100, 4);
await seed(P.cba16, "cs_test_a1wDlHzJ64MGRD3YW6BRDzjmxV9qdsmaB8VlQrLTQuuOAMHwTAt4C95mYD", 100, 4);
await seed(P.cc297, "cs_test_a1GB7MjZFCYUuBPEqXRrcvp5ac5nFyRk7fRfUQSAxUNKyyh0rGP6pgY9k4", 100, 4);
await c.query("set session_replication_role = origin");

// ---- integridade dos payloads usados ----
for (const f of fixtures) ok(`payload ${f.id.slice(0, 24)}… idêntico ao do banco (md5)`, createHash("md5").update(JSON.stringify(f.payload).replace(/\s/g, "")).digest("hex") === f.h);

const sess = (id, o) => t.ctl("session", { id, account: ACC, ...o });
const PROD = { // ledger efetivamente gravado em produção (select em ledger_entries), para comparação
  c8fbc: "bruto:100,casa:96,plataforma:4,taxa_provedor:43", c435e: "bruto:20000,casa:19200,plataforma:800,taxa_provedor:0", c07d4: "bruto:100,casa:96,plataforma:4,taxa_provedor:1",
  c8fbcRef: "bruto:-100,bruto:100,casa:-96,casa:96,plataforma:-4,plataforma:4,taxa_provedor:43", cde60Ref: "bruto:-100,bruto:100,casa:-96,casa:96,plataforma:-4,plataforma:4,taxa_provedor:43",
};
const norm = (s) => s.split(",").sort().join(",");

// 1) pagamento com cartão (R$ 1) — checkout.session.completed REAL
{
  const e = ev("evt_1UVeaOBgdFFYAjqQePfvOf9V"); const o = e.data.object;
  await sess(o.id, { status: "complete", payment_status: "paid", payment_intent: o.payment_intent, fee: 43, method: "card" });
  const r = await hook(e);
  ok("R1 completed REAL (cartão R$1): 200", r.status === 200 && r.body.received === true, JSON.stringify(r));
  const p = await pay(P.c8fbc);
  ok("R1 pagamento confirmado, método card, tarifa 43, ordem 'confirmado'", p.s === "confirmado" && p.pm === "card" && p.pf === 43 && (await ord(P.c8fbc)).s === "confirmado", JSON.stringify(p));
  ok("R1 ledger idêntico ao gravado em produção", norm(await ledger(P.c8fbc)) === norm(PROD.c8fbc), await ledger(P.c8fbc));
  const d = await hook(e);
  ok("R1 reentrega do MESMO evento real -> 200 duplicate, sem novo efeito", d.status === 200 && d.body.duplicate === true && norm(await ledger(P.c8fbc)) === norm(PROD.c8fbc));
  const bad1 = await hook(e, "whsec_outro");
  ok("R1 payload real com assinatura de outro segredo -> 400", bad1.status === 400);
}
// 2) cartão R$ 200 (produção registrou taxa_provedor 0): tarifa disponível no Stripe
{
  const e = ev("evt_1UVhq4BgdFFYAjqQsxgUOny7"); const o = e.data.object;
  await sess(o.id, { status: "complete", payment_status: "paid", payment_intent: o.payment_intent, fee: 837, method: "card" });
  const r = await hook(e);
  ok("R2 completed REAL (cartão R$200): 200 e ledger 20000/19200/800", r.status === 200 && norm((await ledger(P.c435e)).replace(/,taxa_provedor:\d+/, "")) === norm(PROD.c435e.replace(/,taxa_provedor:0/, "")), await ledger(P.c435e));
  ok("R2 tarifa informada pelo Stripe (837) é gravada", (await pay(P.c435e)).pf === 837);
}
// 2b) variante DERIVADA do payload real: balance_transaction ainda indisponível (null) — reproduz o 'taxa_provedor 0' visto em produção
{
  const e = ev("evt_1UVhq4BgdFFYAjqQsxgUOny7"); const ref = "cs_test_VARIANT_no_bt", pid = "99999999-9999-4999-8999-999999999999";
  e.id = "evt_variant_no_bt"; e.data.object.id = ref; e.data.object.metadata.payment_id = pid; e.data.object.payment_intent = "pi_variant_no_bt";
  await c.query("set session_replication_role = replica"); await seed(pid, ref, 20000, 800); await c.query("set session_replication_role = origin");
  await sess(ref, { status: "complete", payment_status: "paid", payment_intent: "pi_variant_no_bt", fee: null, method: "card" });
  const r = await hook(e); const p = await pay(pid);
  ok("R2b (variante) confirmação financeira não depende da tarifa: 200 e confirmado", r.status === 200 && p.s === "confirmado");
  ok("R2b tarifa AINDA NÃO DISPONÍVEL no Stripe deve ficar PENDENTE (null) para a rotina — não gravar 0", p.pf === null, `processor_fee_cents=${p.pf}`);
}
// 3) Pix R$ 1
{
  const e = ev("evt_1UVvstBgdFFYAjqQ9D6j6oTl"); const o = e.data.object;
  await sess(o.id, { status: "complete", payment_status: "paid", payment_intent: o.payment_intent, fee: 1, method: "pix" });
  const r = await hook(e);
  const p = await pay(P.c07d4);
  ok("R3 completed REAL (Pix R$1): 200, método pix, tarifa 1, ledger idêntico ao de produção", r.status === 200 && p.pm === "pix" && p.pf === 1 && norm(await ledger(P.c07d4)) === norm(PROD.c07d4), await ledger(P.c07d4));
}
// 4) reembolso integral — charge.refunded REAL (cartão, pedido aprovado pelo cliente)
{
  const rr = (await one(`select md5('rr8fbc')::uuid id`)).id;
  await c.query("set session_replication_role = replica");
  await c.query(`insert into refund_requests(id,payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,(select order_id from payments where id=$2),$3,$4,'apos_inicio','A casa não entregou como combinado',100,'aprovado')`, [rr, P.c8fbc, H, U.client]).catch((e) => results.push("  (aviso) " + e.message));
  await c.query("set session_replication_role = origin");
  await c.query(`update service_orders set status='em_andamento', started_at=now() where id=(select order_id from payments where id=$1)`, [P.c8fbc]); // em produção o cliente já havia iniciado o serviço (started_at 22:20) antes de pedir o reembolso
  const e = ev("evt_3UVeaNBgdFFYAjqQ0gDZTu65");
  const r = await hook(e);
  ok("R4 charge.refunded REAL (total): 200", r.status === 200 && r.body.received === true, JSON.stringify(r));
  const st4 = { pay: (await pay(P.c8fbc)).s, ordem: (await ord(P.c8fbc)).s, pedido: (await one(`select status s from refund_requests where id=$1`, [rr]))?.s };
  ok("R4 pagamento 'estornado', ordem 'reembolsado', pedido 'reembolsado'", st4.pay === "estornado" && st4.ordem === "reembolsado" && st4.pedido === "reembolsado", JSON.stringify(st4));
  ok("R4 ledger do estorno idêntico ao de produção (-100/-96/-4 sobre 100/96/4)", norm(await ledger(P.c8fbc)) === norm(PROD.c8fbcRef), await ledger(P.c8fbc));
  const d = await hook(e);
  ok("R4 reentrega do evento de reembolso -> duplicate, ledger inalterado", d.body.duplicate === true && norm(await ledger(P.c8fbc)) === norm(PROD.c8fbcRef));
}
// 5) reembolso de cancelamento (de60: confirmada por 'sync', sem evento de conclusão guardado) — charge.refunded REAL
{
  await c.query("set session_replication_role = origin");
  await c.query(`select public.confirm_payment_for($1,'stripe',(select provider_ref from payments where id=$1),$2)`, [P.cde60, ACC]);
  await c.query(`select public.record_processor_fee_for($1,'stripe',(select provider_ref from payments where id=$1),$2,43,'card')`, [P.cde60, ACC]);
  await c.query("set session_replication_role = replica");
  const rr = (await one(`select md5('rrde60')::uuid id`)).id;
  await c.query(`insert into refund_requests(id,payment_id,order_id,house_id,client_id,kind,reason,amount_cents,status) values ($1,$2,(select order_id from payments where id=$2),$3,$4,'antes_do_inicio','Cancelamento antes do início.',100,'aprovado')`, [rr, P.cde60, H, U.client]);
  await c.query("set session_replication_role = origin");
  await c.query(`update service_orders set status='reembolso_pendente' where id=(select order_id from payments where id=$1)`, [P.cde60]); // cancelamento: a ordem fica 'reembolso_pendente' até o estorno
  const r = await hook(ev("evt_3UVdtnBgdFFYAjqQ0im62VDJ"));
  ok("R5 charge.refunded REAL (cancelamento): 200, 'estornado', ordem 'reembolsado', ledger idêntico ao de produção", r.status === 200 && (await pay(P.cde60)).s === "estornado" && (await ord(P.cde60)).s === "reembolsado" && norm(await ledger(P.cde60)) === norm(PROD.cde60Ref), await ledger(P.cde60));
}
// 6) sessões expiradas — checkout.session.expired REAL
{
  for (const [id, pid] of [["evt_1UVsLcBgdFFYAjqQSp4fpUxk", P.cba16], ["evt_1UX9uyBgdFFYAjqQ02b6bYx8", P.cc297]]) {
    const r = await hook(ev(id));
    ok(`R6 expired REAL ${id.slice(0, 22)}…: 200 e pagamento 'falhou' sem lançamentos`, r.status === 200 && (await pay(pid)).s === "falhou" && (await ledger(pid)) === "");
  }
}
// 7) integridade geral
{
  const ev13 = await q(`select count(*)::int n, count(*) filter (where processed_at is not null)::int d from stripe_events`);
  ok("R7 todos os eventos reais reproduzidos ficaram concluídos", ev13[0].n === ev13[0].d && ev13[0].n === 8, JSON.stringify(ev13[0]));
  const dbErr = t.shim.log.errors.filter((x) => !/duplicate key/i.test(x));
  ok("R7 nenhum erro inesperado na camada REST/SQL", dbErr.length === 0, dbErr.slice(0, 3).join(" | "));
}
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} PASS / ${bad} FAIL`);
await t.close();
process.exit(bad ? 1 : 0);
