// Cobrança da Plataforma (casa -> plataforma): planos, vagas, destaque, impulsionamento e créditos. Independente do Marketplace (payments):
// função, segredos, aviso (webhook) e rotina próprios; a falha de um não afeta o outro.
// Fica atrás de billing_config.enabled (desligado por padrão). Duas portas:
//  - chamadas do app (cabeçalho Authorization da casa): pay | sync
//  - aviso do provedor (cabeçalho Stripe-Signature) e a rotina agendada (x-platform-billing-secret).
// Segredos (Supabase > Edge Functions > Secrets): PLATFORM_STRIPE_SECRET_KEY, PLATFORM_STRIPE_WEBHOOK_SECRET, APP_URL (opcional).
// A chave da cobrança da plataforma NÃO é a do Marketplace (STRIPE_SECRET_KEY): conta/chave própria evita misturar os dois domínios.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ChargeStateError, ProviderError, createRegistry } from "./provider.js";
import { createStripeAdapter } from "./stripeAdapter.js";
import { createStore } from "./store.js";
import * as core from "./core.js";
import { CREDIT_PACKS, creditPurchaseError } from "./logic.js";

const SECRET = Deno.env.get("PLATFORM_STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("PLATFORM_STRIPE_WEBHOOK_SECRET") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://ile-conecta.vercel.app").replace(/\/$/, "");
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const registry = createRegistry([createStripeAdapter({ secret: SECRET, webhookSecret: WEBHOOK_SECRET })]);
const store = createStore(admin);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (message: string, status = 400, code?: string) => json({ error: message, code }, status);

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const CODE_STATUS: Record<string, number> = { not_found: 404, forbidden: 403, card_state: 409, refund_denied: 409, refund_failed: 502, disabled: 503, provider_unavailable: 503, paid: 409, cancelled: 409, processing: 409 };

async function userOf(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Método não permitido.", 405);
  if (!SECRET) return fail("Cobrança da plataforma ainda não configurada.", 503);
  try {
    if (req.headers.get("stripe-signature")) {
      const r = await core.processWebhook({ registry, store, providerId: "stripe", rawBody: await req.text(), headers: req.headers });
      return json(r.body, r.status);
    }
    if (req.headers.get("x-platform-billing-secret")) {
      const { data: okSecret } = await admin.rpc("check_platform_billing_cron_secret", { p_secret: req.headers.get("x-platform-billing-secret") ?? "" });
      if (okSecret !== true) return fail("Não autorizado.", 401);
      return json(await core.sweep({ registry, store }));
    }
    const user = await userOf(req);
    if (!user) return fail("Entre na sua conta.", 401);
    const input = (await req.json().catch(() => ({}))) as Obj;
    if (input.action === "buy_credits") {
      // Compra de pacote de créditos: o banco valida (plano com assistente, casa em dia, preço do painel) e reaproveita a fatura aberta.
      const pack = String(input.pack ?? "");
      if (!CREDIT_PACKS.includes(pack)) return fail("Pacote inválido.");
      const { data: h } = await admin.from("houses").select("id").eq("owner_id", user.id).maybeSingle();
      if (!h) return fail("Somente a casa compra créditos.", 403);
      const { data: cid, error: perr } = await admin.rpc("platform_credit_purchase", { p_house: h.id, p_pack: pack });
      if (perr || typeof cid !== "string") {
        console.error("platform_credit_purchase", perr?.message);
        return fail(creditPurchaseError(perr?.message), 409);
      }
      const m = input.method === "pix" || input.method === "card" ? input.method : null;
      const r = await core.openPayment({ registry, store, chargeId: cid, userId: user.id, method: m, email: user.email, appUrl: APP_URL });
      return json({ url: r.url });
    }
    if (input.action === "card_setup") return json(await core.cardSetup({ registry, store, userId: user.id, email: user.email, appUrl: APP_URL }));
    if (input.action === "card_sync") {
      const ref = String(input.session ?? "");
      if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(ref)) return fail("Cadastro inválido.");
      return json(await core.cardSync({ registry, store, userId: user.id, sessionRef: ref }));
    }
    if (input.action === "card_auto") return json(await core.cardSetAuto({ registry, store, userId: user.id, enabled: input.enabled === true }));
    if (input.action === "card_remove") return json(await core.cardRemove({ registry, store, userId: user.id }));
    if (input.action === "credit_refund") {
      const id = String(input.charge_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Informe a compra.");
      return json(await core.creditRefund({ registry, store, userId: user.id, chargeId: id }));
    }
    const chargeId = String(input.charge_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(chargeId)) return fail("Informe a fatura.");
    switch (input.action) {
      case "pay": {
        const method = input.method === "pix" || input.method === "card" || input.method === "card_recurring" ? input.method : null;
        const r = await core.openPayment({ registry, store, chargeId, userId: user.id, method, email: user.email, appUrl: APP_URL });
        return json({ url: r.url });
      }
      case "sync": return json(await core.syncCharge({ registry, store, chargeId, userId: user.id }));
      default: return fail("Ação desconhecida.");
    }
  } catch (e) {
    console.error("platform_billing_error", String(e));
    if (e instanceof ChargeStateError) return fail(e.message, CODE_STATUS[e.code] ?? 409, e.code);
    if (e instanceof ProviderError) return fail("O meio de pagamento não respondeu. Tente de novo em instantes.", 502);
    return fail("Não foi possível concluir agora. Tente de novo.", 500);
  }
});
