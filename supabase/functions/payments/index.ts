// Pagamentos pelo Stripe (cobrança direta na conta da casa). Fica atrás de features.payments (desligado por padrão).
// Uma função, duas portas:
//  - chamadas do app (cabeçalho Authorization do usuário): onboard | status | checkout | sync | refund | refund_cancelled | refund_pending
//  - avisos do Stripe (cabeçalho Stripe-Signature): confirmam pagamento, registram tarifa e concluem reembolso.
// Segredos (Supabase > Edge Functions > Secrets): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_URL (opcional).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  accountState, buildCheckoutParams, classifyEvent, formBody, sessionExpiry, verifyStripeSignature,
} from "./logic.js";

const STRIPE = "https://api.stripe.com";
const API_VERSION = "2026-09-30.endive";
const SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://ile-conecta.vercel.app").replace(/\/$/, "");
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

/** Erro devolvido pelo Stripe: a mensagem é segura para mostrar (não traz segredos) e ajuda a achar o problema. */
class StripeError extends Error {}

async function stripe(path: string, opts: { method?: string; body?: Obj; form?: Obj; account?: string; idem?: string } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${SECRET}`, "Stripe-Version": API_VERSION };
  if (opts.account) headers["Stripe-Account"] = opts.account;
  if (opts.idem) headers["Idempotency-Key"] = opts.idem;
  let body: string | undefined;
  if (opts.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  } else if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = formBody(opts.form);
  }
  const res = await fetch(`${STRIPE}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("stripe_error", path, res.status, JSON.stringify(data?.error ?? data).slice(0, 500));
    throw new StripeError(data?.error?.message ?? "Falha ao falar com o Stripe.");
  }
  return data as Obj;
}

async function userOf(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

async function paymentsOn(owner: string) {
  const { data } = await admin.rpc("payments_enabled", { p_owner: owner });
  return data === true;
}

// ---------- chamadas do app ----------
async function onboard(userId: string, email: string | undefined) {
  const { data: house } = await admin.from("houses").select("id, name").eq("owner_id", userId).maybeSingle();
  if (!house) return fail("Somente a casa cadastra o recebimento.", 403);
  const { data: terms } = await admin.rpc("house_accepted_terms", { p_owner: userId });
  if (terms !== true) return fail("Aceite os termos da casa antes de cadastrar o recebimento.");

  const { data: row } = await admin.from("house_payment_accounts").select("stripe_account_id").eq("house_id", house.id).maybeSingle();
  let acctId: string | null = row?.stripe_account_id ?? null;
  if (!acctId) {
    const base: Obj = {
      contact_email: email,
      display_name: house.name,
      dashboard: "full",
      identity: { country: "br" },
      defaults: { currency: "brl", locales: ["pt-BR"], responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      metadata: { house_id: house.id, owner_id: userId },
      include: ["configuration.merchant", "identity", "requirements"],
    };
    // Pix não é capacidade da API v2: é pedido depois, pela API v1, em refreshStatus.
    const cardOnly = { ...base, configuration: { merchant: { capabilities: { card_payments: { requested: true } } } } };
    const acct = await stripe("/v2/core/accounts", { body: cardOnly, idem: `acct_${house.id}_card` });
    acctId = String(acct.id);
    const { error } = await admin.from("house_payment_accounts").upsert({
      house_id: house.id, owner_id: userId, provider: "stripe", stripe_account_id: acctId, status: "pendente", updated_at: new Date().toISOString(),
    }, { onConflict: "house_id" });
    if (error) return fail("Não foi possível salvar a conta de recebimento.", 500);
  }
  const link = await stripe("/v2/core/account_links", {
    body: {
      account: acctId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          return_url: `${APP_URL}/pagamento/conta?s=ok`,
          refresh_url: `${APP_URL}/pagamento/conta?s=refresh`,
        },
      },
    },
  });
  return json({ url: link.url });
}

async function refreshStatus(userId: string) {
  const { data: house } = await admin.from("houses").select("id").eq("owner_id", userId).maybeSingle();
  if (!house) return fail("Somente a casa consulta o recebimento.", 403);
  const { data: row } = await admin.from("house_payment_accounts").select("stripe_account_id").eq("house_id", house.id).maybeSingle();
  if (!row?.stripe_account_id) return json({ registered: false, charges_enabled: false, payouts_enabled: false, requirements_due: false });
  const acct = await stripe(`/v2/core/accounts/${row.stripe_account_id}?include[0]=configuration.merchant&include[1]=requirements`);
  const st = accountState(acct);
  await admin.from("house_payment_accounts").update({
    ...st, status: st.charges_enabled ? "ativa" : st.requirements_due ? "pendente" : "em_analise", updated_at: new Date().toISOString(),
  }).eq("house_id", house.id);
  // O Pix não existe como capacidade na API v2 desta versão: pela API v1 (mesma conta) ele é lido e pedido.
  let pix: string | null = null;
  if (st.charges_enabled) {
    try {
      const v1 = await stripe(`/v1/accounts/${row.stripe_account_id}`);
      pix = v1?.capabilities?.pix_payments ?? null;
      if (pix === null) {
        const upd = await stripe(`/v1/accounts/${row.stripe_account_id}`, { form: { capabilities: { pix_payments: { requested: true } } } });
        pix = upd?.capabilities?.pix_payments ?? "requested";
      }
    } catch (e) {
      console.error("pix_request_failed", String(e));
      pix = "error";
    }
  }
  if (pix === "active") await ensurePixOn(row.stripe_account_id);
  return json({ registered: true, ...st, pix_status: pix });
}

/** Liga o Pix nas configurações de formas de pagamento da conta da casa (a configuração da plataforma não consegue ligar para contas com painel Stripe). */
async function ensurePixOn(account: string) {
  try {
    const list = await stripe("/v1/payment_method_configurations", { account });
    for (const c of (list.data ?? []) as Obj[]) {
      if (!c.active || c.pix?.display_preference?.preference === "on") continue;
      await stripe(`/v1/payment_method_configurations/${c.id}`, { form: { pix: { display_preference: { preference: "on" } } }, account })
        .catch((e) => console.error("pix_pmc_failed", c.id, String(e)));
    }
  } catch (e) {
    console.error("pix_pmc_failed", String(e));
  }
}

async function checkout(userId: string, email: string | undefined, input: Obj) {
  if (input.member_due_id) {
    // Mensalidade de membro: o banco confere que é do próprio membro e que está aberta; repetir devolve o mesmo pagamento.
    const { data: pid, error: perr } = await admin.rpc("member_due_payment", { p_due: input.member_due_id, p_user: userId });
    if (perr) return fail(perr.message, 400);
    input = { payment_id: pid };
  }
  let q = admin.from("payments").select("id, gross_cents, fee_cents, status, reservation_id, order_id, member_due_id, stripe_account_id, provider_ref, stage_no");
  if (input.payment_id) q = q.eq("id", input.payment_id);
  else if (input.reservation_id) q = q.eq("reservation_id", input.reservation_id).eq("status", "pendente");
  else if (input.order_id) q = q.eq("order_id", input.order_id).eq("status", "pendente").order("stage_no", { ascending: true });
  else return fail("Informe o pagamento.");
  const { data: pays } = await q.limit(1);
  const pay = pays?.[0];
  if (!pay) return fail("Pagamento não encontrado.", 404);
  if (pay.status !== "pendente") return fail("Este pagamento não está mais aberto.");

  // Dono do pagamento e casa de destino.
  let clientId: string | null = null, houseId: string | null = null, title = "Ilê Conecta";
  if (pay.reservation_id) {
    const { data: r } = await admin.from("reservations").select("user_id, expires_at, status, events(title, house_id)").eq("id", pay.reservation_id).single();
    clientId = r?.user_id ?? null;
    houseId = (r?.events as Obj | null)?.house_id ?? null;
    title = (r?.events as Obj | null)?.title ?? "Ritual";
    if (r && (r.status !== "aguardando_pagamento" || new Date(r.expires_at).getTime() <= Date.now())) return fail("A reserva expirou. Faça uma nova reserva.");
  } else if (pay.order_id) {
    const { data: o } = await admin.from("service_orders").select("client_id, house_id, title").eq("id", pay.order_id).single();
    clientId = o?.client_id ?? null;
    houseId = o?.house_id ?? null;
    title = pay.stage_no && pay.stage_no > 0 ? `${o?.title ?? "Serviço"} — etapa ${pay.stage_no}` : (o?.title ?? "Serviço");
  } else if (pay.member_due_id) {
    const { data: d } = await admin.from("member_dues").select("house_id, month, status, house_members(user_id, left_at), houses(name)").eq("id", pay.member_due_id).single();
    if (!d || d.status !== "aberta" || (d.house_members as Obj | null)?.left_at) return fail("Esta mensalidade já está resolvida.");
    clientId = (d.house_members as Obj | null)?.user_id ?? null;
    houseId = d.house_id;
    title = `Mensalidade ${String(d.month).slice(5, 7)}/${String(d.month).slice(0, 4)} — ${(d.houses as Obj | null)?.name ?? "Casa"}`;
  }
  if (clientId !== userId) return fail("Este pagamento não é seu.", 403);
  if (!houseId) return fail("Casa não encontrada.", 404);

  const { data: house } = await admin.from("houses").select("owner_id").eq("id", houseId).single();
  if (!house || !(await paymentsOn(house.owner_id))) return fail("Pagamentos indisponíveis para esta casa.");
  const { data: acc } = await admin.from("house_payment_accounts").select("stripe_account_id, charges_enabled").eq("house_id", houseId).maybeSingle();
  if (!acc?.stripe_account_id || !acc.charges_enabled) return fail("Esta casa ainda não pode receber pagamentos.");

  // Reaproveita a sessão aberta (não cria duas cobranças para o mesmo pagamento).
  if (pay.provider_ref) {
    try {
      const s = await stripe(`/v1/checkout/sessions/${pay.provider_ref}`, { account: acc.stripe_account_id });
      if (s.status === "open" && s.url) return json({ url: s.url });
    } catch (_) { /* cria outra abaixo */ }
  }
  const params = buildCheckoutParams({ payment: pay, title, appUrl: APP_URL, clientEmail: email, expiresAt: sessionExpiry() });
  // As formas de pagamento vêm das configurações do painel (a API nova não aceita payment_method_types).
  const session = await stripe("/v1/checkout/sessions", { form: params, account: acc.stripe_account_id, idem: `cs_${pay.id}_${pay.provider_ref ?? "0"}` });
  const { error } = await admin.from("payments").update({ provider_ref: session.id, stripe_account_id: acc.stripe_account_id, payment_method: null }).eq("id", pay.id).eq("status", "pendente");
  if (error) return fail("Não foi possível abrir o pagamento.", 500);
  return json({ url: session.url });
}

// Confere no Stripe se o pagamento foi feito (rede de segurança caso o aviso automático atrase ou falhe).
async function syncPayment(userId: string, paymentId: string) {
  const { data: pay } = await admin.from("payments").select("id, status, provider_ref, stripe_account_id, reservation_id, order_id, member_due_id").eq("id", paymentId).maybeSingle();
  if (!pay) return fail("Pagamento não encontrado.", 404);
  let clientId: string | null = null;
  if (pay.reservation_id) {
    const { data: r } = await admin.from("reservations").select("user_id").eq("id", pay.reservation_id).maybeSingle();
    clientId = r?.user_id ?? null;
  } else if (pay.order_id) {
    const { data: o } = await admin.from("service_orders").select("client_id").eq("id", pay.order_id).maybeSingle();
    clientId = o?.client_id ?? null;
  } else if (pay.member_due_id) {
    const { data: d } = await admin.from("member_dues").select("house_members(user_id)").eq("id", pay.member_due_id).maybeSingle();
    clientId = (d?.house_members as Obj | null)?.user_id ?? null;
  }
  if (clientId !== userId) return fail("Este pagamento não é seu.", 403);
  if (pay.status !== "pendente" || !pay.provider_ref || !pay.stripe_account_id) return json({ status: pay.status });
  const session = await stripe(`/v1/checkout/sessions/${pay.provider_ref}`, { account: pay.stripe_account_id });
  if (session.payment_status === "paid") {
    const { data: res, error } = await admin.rpc("confirm_payment", { p_provider_ref: pay.provider_ref });
    if (error) return fail(error.message, 500);
    await recordFee(session, pay.stripe_account_id);
    if (res === "reembolso_pendente" && pay.member_due_id) {
      await refundMemberPayment(pay.id);
      return json({ status: "reembolsado" });
    }
    return json({ status: "confirmado" });
  }
  return json({ status: pay.status, stripe_status: session.payment_status });
}

// ---------- reembolso integral de cancelamentos (antes do início) ----------
async function isAdminUser(userId: string) {
  const { data } = await admin.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

/** Devolve ao cliente, pelo Stripe, todos os pagamentos confirmados de uma reserva ou pedido que está em "reembolso_pendente". */
async function settleSource(kind: "reserva" | "pedido", sourceId: string): Promise<{ refunded: number; failed: number }> {
  const col = kind === "reserva" ? "reservation_id" : "order_id";
  const { data: pays } = await admin.from("payments").select("id, provider_ref, stripe_account_id").eq(col, sourceId).eq("status", "confirmado").order("stage_no");
  let refunded = 0, failed = 0;
  for (const pay of pays ?? []) {
    try {
      if (!pay.provider_ref || !pay.stripe_account_id) { failed++; continue; }
      const session = await stripe(`/v1/checkout/sessions/${pay.provider_ref}`, { account: pay.stripe_account_id });
      if (!session.payment_intent) { failed++; continue; }
      await stripe("/v1/refunds", {
        form: { payment_intent: session.payment_intent, refund_application_fee: true, metadata: { payment_id: pay.id, reason: "cancelamento" } },
        account: pay.stripe_account_id, idem: `cancel_refund_${pay.id}`,
      });
      const { error } = await admin.rpc("complete_cancel_refund", { p_payment: pay.id });
      if (error) throw new Error(error.message);
      refunded++;
    } catch (e) {
      console.error("settle_failed", pay.id, String(e));
      failed++;
    }
  }
  return { refunded, failed };
}

async function mayRefundSource(userId: string, kind: "reserva" | "pedido", sourceId: string): Promise<{ ok: boolean; pending: boolean }> {
  let clientId: string | null = null, houseId: string | null = null, status: string | null = null;
  if (kind === "reserva") {
    const { data: r } = await admin.from("reservations").select("user_id, status, events(house_id)").eq("id", sourceId).maybeSingle();
    clientId = r?.user_id ?? null; status = r?.status ?? null; houseId = (r?.events as Obj | null)?.house_id ?? null;
  } else {
    const { data: o } = await admin.from("service_orders").select("client_id, house_id, status").eq("id", sourceId).maybeSingle();
    clientId = o?.client_id ?? null; status = o?.status ?? null; houseId = o?.house_id ?? null;
  }
  if (!status) return { ok: false, pending: false };
  let ok = clientId === userId;
  if (!ok && houseId) {
    const { data: h } = await admin.from("houses").select("owner_id").eq("id", houseId).maybeSingle();
    ok = h?.owner_id === userId;
  }
  if (!ok) ok = await isAdminUser(userId);
  return { ok, pending: status === "reembolso_pendente" };
}

async function refundCancelled(userId: string, kind: string, sourceId: string) {
  if (kind !== "reserva" && kind !== "pedido") return fail("Tipo inválido.");
  const { ok, pending } = await mayRefundSource(userId, kind, sourceId);
  if (!ok) return fail("Não autorizado.", 403);
  if (!pending) return json({ refunded: 0, failed: 0 });
  return json(await settleSource(kind, sourceId));
}

/** Conclui os reembolsos pendentes da pessoa (ou de todos, para a administração). Roda ao abrir "Minha atividade" e a fila de reembolsos. */
async function refundPending(userId: string) {
  const all = await isAdminUser(userId);
  let rq = admin.from("reservations").select("id").eq("status", "reembolso_pendente").limit(50);
  let oq = admin.from("service_orders").select("id").eq("status", "reembolso_pendente").limit(50);
  if (!all) { rq = rq.eq("user_id", userId); oq = oq.eq("client_id", userId); }
  const [{ data: rs }, { data: os }] = await Promise.all([rq, oq]);
  let refunded = 0, failed = 0;
  for (const r of rs ?? []) { const x = await settleSource("reserva", r.id); refunded += x.refunded; failed += x.failed; }
  for (const o of os ?? []) { const x = await settleSource("pedido", o.id); refunded += x.refunded; failed += x.failed; }
  return json({ refunded, failed });
}

/** Rotina agendada (pg_cron): conclui os reembolsos de cancelamento pendentes de qualquer pessoa. Só roda com o segredo da rotina. */
async function sweep(req: Request) {
  // A senha da rotina fica no Vault do banco (a mesma que o agendamento usa).
  const { data: okSecret } = await admin.rpc("check_cron_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (okSecret !== true) return fail("Não autorizado.", 401);
  const [{ data: rs }, { data: os }] = await Promise.all([
    admin.from("reservations").select("id").eq("status", "reembolso_pendente").limit(50),
    admin.from("service_orders").select("id").eq("status", "reembolso_pendente").limit(50),
  ]);
  let refunded = 0, failed = 0;
  for (const r of rs ?? []) { const x = await settleSource("reserva", r.id); refunded += x.refunded; failed += x.failed; }
  for (const o of os ?? []) { const x = await settleSource("pedido", o.id); refunded += x.refunded; failed += x.failed; }
  return json({ refunded, failed });
}

/** Devolve ao pagador, pelo Stripe, um pedido de reembolso já aprovado, e fecha o pedido. Devolve a mensagem de erro, ou null. */
async function executeRefund(rr: { id: string; payment_id: string }): Promise<string | null> {
  const { data: pay } = await admin.from("payments").select("id, provider_ref, stripe_account_id, status").eq("id", rr.payment_id).single();
  if (!pay?.provider_ref || !pay.stripe_account_id) return "Pagamento sem registro no Stripe.";
  const session = await stripe(`/v1/checkout/sessions/${pay.provider_ref}`, { account: pay.stripe_account_id });
  if (!session.payment_intent) return "Pagamento ainda não foi concluído no Stripe.";
  try {
    await stripe("/v1/refunds", {
      form: { payment_intent: session.payment_intent, refund_application_fee: true, metadata: { refund_request_id: rr.id } },
      account: pay.stripe_account_id, idem: `refund_${rr.id}`,
    });
  } catch (e) {
    return String((e as Error).message);
  }
  const { error } = await admin.rpc("complete_refund", { p_id: rr.id });
  return error ? error.message : null;
}

async function refund(userId: string, refundId: string) {
  const { data: rr } = await admin.from("refund_requests").select("id, status, payment_id, client_id").eq("id", refundId).maybeSingle();
  if (!rr) return fail("Pedido de reembolso não encontrado.", 404);
  const { data: isAdm } = await admin.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (rr.client_id !== userId && !isAdm) return fail("Não autorizado.", 403);
  if (rr.status === "reembolsado") return json({ ok: true, already: true });
  if (rr.status !== "aprovado") return fail("Este reembolso ainda não foi aprovado.");
  const err = await executeRefund(rr);
  return err ? fail(err) : json({ ok: true });
}

/** Pix de mensalidade que chegou depois de a casa já ter marcado o mês: devolve o valor inteiro, sem passar pelo painel. */
async function refundMemberPayment(paymentId: string) {
  try {
    const { data: rr } = await admin.from("refund_requests").select("id, payment_id").eq("payment_id", paymentId).eq("status", "aprovado").maybeSingle();
    if (rr) {
      const err = await executeRefund(rr);
      if (err) console.error("member_refund_failed", paymentId, err);
    }
  } catch (e) {
    console.error("member_refund_failed", paymentId, String(e)); // fica "aprovado" no painel do admin para reenviar
  }
}

// ---------- avisos do Stripe ----------
async function webhook(req: Request) {
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), WEBHOOK_SECRET);
  if (!ok) return fail("Assinatura inválida.", 400);
  const event = JSON.parse(raw) as Obj;
  const { error: insErr } = await admin.from("stripe_events").insert({
    id: event.id, type: event.type, account_id: event.account ?? null, payload: event,
  });
  if (insErr) {
    // Já recebido: se terminou, ignora; se não, tenta de novo.
    const { data: prev } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (prev?.processed_at) return json({ received: true, duplicate: true });
  }
  try {
    await handleEvent(event);
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return json({ received: true });
  } catch (e) {
    await admin.from("stripe_events").update({ error: String((e as Error).message).slice(0, 500) }).eq("id", event.id);
    return fail("Falha ao processar.", 500); // o Stripe tenta de novo
  }
}

async function handleEvent(event: Obj) {
  const kind = classifyEvent(event.type);
  const obj = event.data?.object ?? {};
  if (kind === "paid_candidate") {
    if (obj.payment_status !== "paid") return; // Pix ainda aguardando: vem outro aviso quando pagar
    const { data: pay } = await admin.from("payments").select("id, stripe_account_id, member_due_id").eq("provider_ref", obj.id).maybeSingle();
    if (!pay) return;
    if (event.account && pay.stripe_account_id && event.account !== pay.stripe_account_id) throw new Error("Conta divergente.");
    const { data: res, error } = await admin.rpc("confirm_payment", { p_provider_ref: obj.id });
    if (error) throw new Error(error.message);
    await recordFee(obj, pay.stripe_account_id ?? event.account);
    if (res === "reembolso_pendente" && pay.member_due_id) await refundMemberPayment(pay.id);
  } else if (kind === "failed") {
    await admin.from("payments").update({ status: "falhou" }).eq("provider_ref", obj.id).eq("status", "pendente");
  } else if (kind === "refunded") {
    const paymentId = obj.metadata?.payment_id;
    if (!paymentId) return;
    const { data: rr } = await admin.from("refund_requests").select("id").eq("payment_id", paymentId).eq("status", "aprovado").maybeSingle();
    if (rr) await admin.rpc("complete_refund", { p_id: rr.id });
  }
}

async function recordFee(session: Obj, account: string | null) {
  try {
    if (!session.payment_intent || !account) return;
    const pi = await stripe(`/v1/payment_intents/${session.payment_intent}?expand[0]=latest_charge.balance_transaction`, { account });
    const details: Obj[] = pi.latest_charge?.balance_transaction?.fee_details ?? [];
    const stripeFee = details.filter((d) => d.type === "stripe_fee").reduce((a, d) => a + Number(d.amount), 0);
    const method = pi.latest_charge?.payment_method_details?.type;
    await admin.from("payments").update({ payment_method: method === "pix" ? "pix" : method === "card" ? "card" : null }).eq("provider_ref", session.id);
    await admin.rpc("record_processor_fee", { p_provider_ref: session.id, p_fee_cents: stripeFee });
  } catch (e) {
    console.error("record_fee_failed", String(e)); // informativo: não impede a confirmação
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Método não permitido.", 405);
  if (!SECRET) return fail("Pagamentos ainda não configurados.", 503);
  if (req.headers.get("stripe-signature")) return await webhook(req);
  if (req.headers.get("x-cron-secret")) return await sweep(req);
  try {
    const user = await userOf(req);
    if (!user) return fail("Entre na sua conta.", 401);
    const input = (await req.json().catch(() => ({}))) as Obj;
    switch (input.action) {
      case "onboard": return await onboard(user.id, user.email);
      case "status": return await refreshStatus(user.id);
      case "checkout": return await checkout(user.id, user.email, input);
      case "sync": return await syncPayment(user.id, String(input.payment_id ?? ""));
      case "refund": return await refund(user.id, String(input.refund_id ?? ""));
      case "refund_cancelled": return await refundCancelled(user.id, String(input.kind ?? ""), String(input.source_id ?? ""));
      case "refund_pending": return await refundPending(user.id);
      default: return fail("Ação desconhecida.");
    }
  } catch (e) {
    console.error("payments_error", String(e));
    if (e instanceof StripeError) return fail(`Stripe: ${e.message}`.slice(0, 300), 502);
    return fail("Não foi possível concluir agora. Tente de novo.", 500);
  }
});
