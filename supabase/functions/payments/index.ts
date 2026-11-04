// Pagamentos (hoje só o Stripe, cobrança direta na conta da casa). Fica atrás de features.payments (desligado por padrão).
// Esta camada só cuida de HTTP, autenticação e autorização. Toda conversa com o provedor está em stripeAdapter.js
// (contrato em provider.js) e as regras financeiras em core.js; o banco é acessado por store.js.
// Uma função, duas portas:
//  - chamadas do app (cabeçalho Authorization do usuário): onboard | status | checkout | sync | refund | refund_cancelled | refund_pending
//  - avisos do provedor (cabeçalho Stripe-Signature) e a rotina agendada (x-cron-secret).
// Segredos (Supabase > Edge Functions > Secrets): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_URL (opcional).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { sessionExpiry } from "./logic.js";
import { DivergenceError, ProviderError, createRegistry } from "./provider.js";
import { createStripeAdapter } from "./stripeAdapter.js";
import { createStore, PAYMENT_COLS } from "./store.js";
import * as core from "./core.js";

const SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://ile-conecta.vercel.app").replace(/\/$/, "");
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

// Provedor ativo para NOVAS cobranças e cadastros. Pagamentos já existentes seguem o provedor gravado neles.
const ACTIVE_PROVIDER = "stripe";
const registry = createRegistry([createStripeAdapter({ secret: SECRET, webhookSecret: WEBHOOK_SECRET })], [ACTIVE_PROVIDER]);
const store = createStore(admin);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

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

async function isAdminUser(userId: string) {
  const { data } = await admin.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

// ---------- chamadas do app ----------
async function onboard(userId: string, email: string | undefined) {
  const { data: house } = await admin.from("houses").select("id, name").eq("owner_id", userId).maybeSingle();
  if (!house) return fail("Somente a casa cadastra o recebimento.", 403);
  const { data: terms } = await admin.rpc("house_accepted_terms", { p_owner: userId });
  if (terms !== true) return fail("Aceite os termos da casa antes de cadastrar o recebimento.");

  const { data: row } = await admin.from("house_payment_accounts").select("provider, stripe_account_id").eq("house_id", house.id).maybeSingle();
  // Conta já cadastrada segue o provedor dela; cadastro novo só em provedor ativo.
  const adapter = row?.stripe_account_id ? registry.byId(row.provider ?? ACTIVE_PROVIDER) : registry.forNew(ACTIVE_PROVIDER);
  if (!adapter) return fail("Provedor da conta não disponível.", 409);
  const r = await adapter.onboardAccount({ existingAccount: row?.stripe_account_id ?? null, house, userId, email, appUrl: APP_URL });
  if (r.created) {
    const { error } = await admin.from("house_payment_accounts").upsert({
      house_id: house.id, owner_id: userId, provider: adapter.id, stripe_account_id: r.account, status: "pendente", updated_at: new Date().toISOString(),
    }, { onConflict: "house_id" });
    if (error) return fail("Não foi possível salvar a conta de recebimento.", 500);
  }
  return json({ url: r.url });
}

async function refreshStatus(userId: string) {
  const { data: house } = await admin.from("houses").select("id").eq("owner_id", userId).maybeSingle();
  if (!house) return fail("Somente a casa consulta o recebimento.", 403);
  const { data: row } = await admin.from("house_payment_accounts").select("provider, stripe_account_id").eq("house_id", house.id).maybeSingle();
  if (!row?.stripe_account_id) return json({ registered: false, charges_enabled: false, payouts_enabled: false, requirements_due: false });
  const adapter = registry.byId(row.provider ?? ACTIVE_PROVIDER);
  if (!adapter) return fail("Provedor da conta não disponível.", 409);
  const { pix_status, ...st } = await adapter.accountStatus({ account: row.stripe_account_id });
  await admin.from("house_payment_accounts").update({
    ...st, status: st.charges_enabled ? "ativa" : st.requirements_due ? "pendente" : "em_analise", updated_at: new Date().toISOString(),
  }).eq("house_id", house.id);
  return json({ registered: true, ...st, pix_status });
}

async function checkout(userId: string, email: string | undefined, input: Obj) {
  if (input.member_due_id) {
    // Mensalidade de membro: o banco confere que é do próprio membro e que está aberta; repetir devolve o mesmo pagamento.
    const { data: pid, error: perr } = await admin.rpc("member_due_payment", { p_due: input.member_due_id, p_user: userId });
    if (perr) return fail(perr.message, 400);
    input = { payment_id: pid };
  }
  let q = admin.from("payments").select(PAYMENT_COLS);
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
  const { data: acc } = await admin.from("house_payment_accounts").select("provider, stripe_account_id, charges_enabled").eq("house_id", houseId).maybeSingle();
  if (!acc?.stripe_account_id || !acc.charges_enabled) return fail("Esta casa ainda não pode receber pagamentos.");
  if ((acc.provider ?? ACTIVE_PROVIDER) !== pay.provider) return fail("O provedor da casa mudou depois da criação deste pagamento.", 409);

  const r = await core.openCheckout({
    registry, store, pay, providerId: pay.provider, houseAccount: acc.stripe_account_id, title, email, appUrl: APP_URL, expiresAt: sessionExpiry(),
  });
  return json({ url: r.url });
}

// Confere no provedor se o pagamento foi feito (rede de segurança caso o aviso automático atrase ou falhe).
async function syncPayment(userId: string, paymentId: string) {
  const pay = await store.paymentById(paymentId);
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
  return json(await core.syncPayment({ registry, store, pay }));
}

// ---------- reembolso integral de cancelamentos (antes do início) ----------
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
  return json(await core.settleSource({ registry, store, kind, sourceId }));
}

/** Conclui os reembolsos pendentes da pessoa (ou de todos, para a administração). Roda ao abrir "Minha atividade" e a fila de reembolsos. */
async function refundPending(userId: string) {
  const all = await isAdminUser(userId);
  return json(await core.settlePending({ registry, store, scope: all ? null : userId }));
}

/** Rotina agendada (pg_cron). Só roda com o segredo da rotina, guardado no Vault do banco. */
async function sweep(req: Request) {
  const { data: okSecret } = await admin.rpc("check_cron_secret", { p_secret: req.headers.get("x-cron-secret") ?? "" });
  if (okSecret !== true) return fail("Não autorizado.", 401);
  return json(await core.sweep({ registry, store }));
}

async function refund(userId: string, refundId: string) {
  const { data: rr } = await admin.from("refund_requests").select("id, status, payment_id, client_id").eq("id", refundId).maybeSingle();
  if (!rr) return fail("Pedido de reembolso não encontrado.", 404);
  if (rr.client_id !== userId && !(await isAdminUser(userId))) return fail("Não autorizado.", 403);
  if (rr.status === "reembolsado") return json({ ok: true, already: true });
  if (rr.status !== "aprovado") return fail("Este reembolso ainda não foi aprovado.");
  const err = await core.executeRefund({ registry, store, rr });
  return err ? fail(err) : json({ ok: true });
}

// ---------- avisos do provedor ----------
async function webhook(req: Request) {
  const raw = await req.text();
  const r = await core.processWebhook({ registry, store, providerId: "stripe", rawBody: raw, headers: req.headers });
  return json(r.body, r.status);
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
    if (e instanceof DivergenceError) return fail(e.message, 409);
    if (e instanceof ProviderError) return fail(`Provedor: ${e.message}`.slice(0, 300), 502);
    return fail("Não foi possível concluir agora. Tente de novo.", 500);
  }
});
