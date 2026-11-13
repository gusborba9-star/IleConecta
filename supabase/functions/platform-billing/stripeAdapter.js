// Adaptador do Stripe para a Cobrança da Plataforma: conta PRÓPRIA da plataforma (sem Stripe-Account, sem repasse).
// É o único arquivo desta função que fala com a API do Stripe. Sem Deno: tudo entra pela fábrica, então roda em Node nos testes.
import { buildAutoChargeParams, buildCardSetupParams, buildCheckoutParams, classifyEvent, interpretAutoCharge, feeFromBalanceTransaction, formBody, verifyStripeSignature } from "./logic.js";
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

  /** Como call(), mas devolve a resposta do Stripe também em erro (a recusa de cartão vem como 402 com o detalhe). Falha de rede = lança. */
  async function callRaw(path, opts) {
    const headers = { Authorization: `Bearer ${secret}`, "Stripe-Version": apiVersion, "Content-Type": "application/x-www-form-urlencoded" };
    if (opts.idem) headers["Idempotency-Key"] = opts.idem;
    const res = await fetchImpl(`${BASE}${path}`, { method: "POST", headers, body: formBody(opts.form ?? {}) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
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
      if (String(ref).startsWith("pi_")) {
        // Cobrança automática: a referência é o próprio pagamento (sem página de checkout).
        const p = await call(`/v1/payment_intents/${encodeURIComponent(ref)}?expand[0]=latest_charge.balance_transaction`);
        const charge = p.latest_charge && typeof p.latest_charge === "object" ? p.latest_charge : null;
        const paid = p.status === "succeeded";
        return {
          ref: String(p.id),
          status: paid || p.status === "processing" ? "complete" : p.status === "canceled" || p.status === "requires_payment_method" ? "expired" : "open",
          url: null,
          paid,
          pending: p.status === "processing",
          amountCents: Number.isFinite(Number(p.amount)) ? Number(p.amount) : null,
          currency: String(p.currency ?? "").toLowerCase(),
          feeCents: paid ? feeFromBalanceTransaction(charge?.balance_transaction) : null,
        };
      }
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

    // ---- cartão salvo da casa ----
    async ensureCustomer({ houseId, email, idempotencyKey }) {
      const c = await call("/v1/customers", { form: { email: email || undefined, metadata: { house_id: houseId } }, idem: idempotencyKey });
      if (!c.id) throw new ProviderError("O Stripe não criou o cadastro.", "stripe_error");
      return String(c.id);
    },

    async createCardSetup({ customer, houseId, appUrl, expiresAtSec }) {
      const s = await call("/v1/checkout/sessions", { form: buildCardSetupParams({ customer, houseId, appUrl, expiresAtSec }) });
      if (!s.id || !String(s.url ?? "").startsWith("https://")) throw new ProviderError("O Stripe não devolveu a página do cartão.", "stripe_error");
      return { ref: String(s.id), url: String(s.url) };
    },

    async getCardSetup({ ref }) {
      const s = await call(`/v1/checkout/sessions/${encodeURIComponent(ref)}?expand[0]=setup_intent.payment_method`);
      const si = s.setup_intent && typeof s.setup_intent === "object" ? s.setup_intent : null;
      const pm = si?.payment_method && typeof si.payment_method === "object" ? si.payment_method : null;
      const card = pm?.card ?? null;
      const complete = s.mode === "setup" && s.status === "complete" && si?.status === "succeeded" && Boolean(pm?.id) && Boolean(card);
      return {
        complete,
        houseId: s.metadata?.house_id ?? null,
        customer: typeof s.customer === "string" ? s.customer : s.customer?.id ?? null,
        method: complete ? { id: String(pm.id), brand: String(card.brand ?? "card"), last4: String(card.last4 ?? ""), expMonth: Number(card.exp_month), expYear: Number(card.exp_year) } : null,
      };
    },

    /** Cobra o cartão salvo sem a pessoa presente. null = não sabemos o resultado (repete depois com a mesma chave). */
    async chargeSaved({ charge, customer, method, attempt, idempotencyKey }) {
      const r = interpretAutoCharge(await callRaw("/v1/payment_intents", { form: buildAutoChargeParams({ charge, customer, method, attempt }), idem: idempotencyKey }));
      if (!r) return null;
      if (r.cancel) await call(`/v1/payment_intents/${encodeURIComponent(r.cancel)}/cancel`, { method: "POST", form: {} }).catch((e) => log.error("auto_cancel_failed", String(e?.message ?? e)));
      return { outcome: r.outcome, ref: r.ref, code: r.code };
    },

    async detachCard({ method }) {
      await call(`/v1/payment_methods/${encodeURIComponent(method)}/detach`, { method: "POST", form: {} });
    },

    verifyWebhook(rawBody, headers) {
      const h = typeof headers?.get === "function" ? headers.get("stripe-signature") : headers?.["stripe-signature"];
      return verifyStripeSignature(rawBody, h ?? null, webhookSecret);
    },

    parseEvent(event) {
      const obj = event?.data?.object ?? {};
      return { id: String(event?.id ?? ""), type: String(event?.type ?? ""), kind: classifyEvent(event?.type, obj), ref: obj.id ? String(obj.id) : null };
    },
  };
}
