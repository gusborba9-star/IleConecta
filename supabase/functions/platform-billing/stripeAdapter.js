// Adaptador do Stripe para a Cobrança da Plataforma: conta PRÓPRIA da plataforma (sem Stripe-Account, sem repasse).
// É o único arquivo desta função que fala com a API do Stripe. Sem Deno: tudo entra pela fábrica, então roda em Node nos testes.
import { buildCheckoutParams, classifyEvent, feeFromBalanceTransaction, formBody, verifyStripeSignature } from "./logic.js";
import { ProviderError } from "./provider.js";

const BASE = "https://api.stripe.com";
export const STRIPE_API_VERSION = "2026-09-30.endive";

export function createStripeAdapter({ secret, webhookSecret, apiVersion = STRIPE_API_VERSION, fetchImpl = fetch, log = console }) {
  async function call(path, opts = {}) {
    const headers = { Authorization: `Bearer ${secret}`, "Stripe-Version": apiVersion };
    if (opts.idem) headers["Idempotency-Key"] = opts.idem;
    let body;
    if (opts.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = formBody(opts.form);
    }
    const res = await fetchImpl(`${BASE}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.error("stripe_error", path, res.status, JSON.stringify(data?.error ?? data).slice(0, 500));
      throw new ProviderError(data?.error?.message ?? "Falha ao falar com o Stripe.", "stripe_error");
    }
    return data;
  }

  return {
    id: "stripe",

    async createCheckout({ charge, methods, appUrl, email, expiresAtSec, idempotencyKey }) {
      const params = buildCheckoutParams({ charge, methods, appUrl, email, expiresAtSec });
      const s = await call("/v1/checkout/sessions", { form: params, idem: idempotencyKey });
      if (!s.id || !String(s.url ?? "").startsWith("https://")) throw new ProviderError("O Stripe não devolveu a página de pagamento.", "stripe_error");
      return { ref: String(s.id), url: String(s.url), method: (methods ?? []).length === 1 ? methods[0] : null };
    },

    /** Estado atual da página de pagamento (sempre consultado de novo: o aviso só diz ONDE olhar, não o que vale). */
    async getCheckout({ ref }) {
      const s = await call(`/v1/checkout/sessions/${encodeURIComponent(ref)}?expand[0]=payment_intent.latest_charge.balance_transaction`);
      const pi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
      const charge = pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      const paid = s.payment_status === "paid";
      return {
        ref: String(s.id),
        status: s.status === "complete" ? "complete" : s.status === "expired" ? "expired" : "open",
        url: s.url ?? null,
        paid,
        // concluída pelo cliente, mas o dinheiro ainda não chegou (Pix e outros assíncronos)
        pending: s.status === "complete" && !paid,
        amountCents: Number.isFinite(Number(s.amount_total)) ? Number(s.amount_total) : null,
        currency: String(s.currency ?? "").toLowerCase(),
        feeCents: paid ? feeFromBalanceTransaction(charge?.balance_transaction) : null,
      };
    },

    verifyWebhook(rawBody, headers) {
      const h = typeof headers?.get === "function" ? headers.get("stripe-signature") : headers?.["stripe-signature"];
      return verifyStripeSignature(rawBody, h ?? null, webhookSecret);
    },

    parseEvent(event) {
      const obj = event?.data?.object ?? {};
      return { id: String(event?.id ?? ""), type: String(event?.type ?? ""), kind: classifyEvent(event?.type), ref: obj.id ? String(obj.id) : null };
    },
  };
}
