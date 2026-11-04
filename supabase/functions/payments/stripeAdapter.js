// Adaptador do Stripe Connect (cobrança direta na conta da casa, comissão por application_fee_amount).
// É o ÚNICO lugar que fala com a API do Stripe. Sem Deno e sem acesso a segredos: tudo entra pela fábrica, então roda em Node nos testes.
import { accountState, buildCheckoutParams, classifyEvent, formBody, verifyStripeSignature } from "./logic.js";
import { ProviderError } from "./provider.js";

const BASE = "https://api.stripe.com";
export const STRIPE_API_VERSION = "2026-09-30.endive";

/** Estados do reembolso no Stripe que contam como "já devolvido ou a caminho". */
const LIVE_REFUND = new Set(["succeeded", "pending", "requires_action"]);

export function createStripeAdapter({ secret, webhookSecret, apiVersion = STRIPE_API_VERSION, fetchImpl = fetch, log = console }) {
  /** Chamada à API. A mensagem de erro do Stripe é segura para mostrar (não traz segredos). */
  async function call(path, opts = {}) {
    const headers = { Authorization: `Bearer ${secret}`, "Stripe-Version": apiVersion };
    if (opts.account) headers["Stripe-Account"] = opts.account;
    if (opts.idem) headers["Idempotency-Key"] = opts.idem;
    let body;
    if (opts.body) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    } else if (opts.form) {
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

  /** Liga o Pix nas configurações de formas de pagamento da conta da casa. */
  async function ensurePixOn(account) {
    try {
      const list = await call("/v1/payment_method_configurations", { account });
      for (const c of list.data ?? []) {
        if (!c.active || c.pix?.display_preference?.preference === "on") continue;
        await call(`/v1/payment_method_configurations/${c.id}`, { form: { pix: { display_preference: { preference: "on" } } }, account })
          .catch((e) => log.error("pix_pmc_failed", c.id, String(e)));
      }
    } catch (e) {
      log.error("pix_pmc_failed", String(e));
    }
  }

  return {
    id: "stripe",

    // ---------- cobrança ----------
    async createCheckout({ payment, title, appUrl, clientEmail, account, expiresAt, idempotencyKey }) {
      const params = buildCheckoutParams({ payment, title, appUrl, clientEmail, expiresAt });
      const s = await call("/v1/checkout/sessions", { form: params, account, idem: idempotencyKey });
      return { ref: String(s.id), url: s.url ?? null };
    },

    async getCheckout({ ref, account }) {
      const s = await call(`/v1/checkout/sessions/${ref}`, { account });
      return { ref: String(s.id), status: s.status, url: s.url ?? null, paid: s.payment_status === "paid", paymentStatus: s.payment_status, paymentRef: s.payment_intent ?? null };
    },

    // ---------- reembolso ----------
    /**
     * Devolve o valor inteiro. Antes de criar, procura um reembolso vivo para a mesma cobrança: se a chamada anterior
     * deu certo no Stripe mas não chegou a ser registrada aqui, o reenvio reaproveita o reembolso em vez de duplicar
     * (a chave de idempotência do Stripe vale só 24 h).
     */
    async refund({ ref, account, correlation = {}, idempotencyKey }) {
      const s = await call(`/v1/checkout/sessions/${ref}`, { account });
      if (!s.payment_intent) throw new ProviderError("Pagamento ainda não foi concluído no Stripe.", "not_paid");
      const existing = await call(`/v1/refunds?payment_intent=${encodeURIComponent(s.payment_intent)}&limit=100`, { account });
      const live = (existing.data ?? []).find((r) => LIVE_REFUND.has(r.status));
      if (live) return { refundRef: String(live.id), status: live.status, reused: true };
      const metadata = { provider: "stripe", ...Object.fromEntries(Object.entries(correlation).filter(([, v]) => v !== undefined && v !== null)) };
      const r = await call("/v1/refunds", { form: { payment_intent: s.payment_intent, refund_application_fee: true, metadata }, account, idem: idempotencyKey });
      return { refundRef: String(r.id), status: r.status, reused: false };
    },

    // ---------- conciliação de tarifas (separada da confirmação financeira) ----------
    async fetchFees({ ref, account }) {
      const s = await call(`/v1/checkout/sessions/${ref}`, { account });
      if (!s.payment_intent) return null;
      const pi = await call(`/v1/payment_intents/${s.payment_intent}?expand[0]=latest_charge.balance_transaction`, { account });
      const details = pi.latest_charge?.balance_transaction?.fee_details ?? [];
      const feeCents = details.filter((d) => d.type === "stripe_fee").reduce((a, d) => a + Number(d.amount), 0);
      const type = pi.latest_charge?.payment_method_details?.type;
      return { feeCents, method: type === "pix" ? "pix" : type === "card" ? "card" : null };
    },

    // ---------- avisos ----------
    verifyWebhook(rawBody, headers) {
      const h = typeof headers?.get === "function" ? headers.get("stripe-signature") : headers?.["stripe-signature"];
      return verifyStripeSignature(rawBody, h ?? null, webhookSecret);
    },

    /** Aviso do Stripe -> forma neutra que o núcleo entende. */
    parseEvent(event) {
      const kind = classifyEvent(event?.type);
      const obj = event?.data?.object ?? {};
      const base = { id: String(event?.id ?? ""), type: String(event?.type ?? ""), kind, account: event?.account ?? null };
      if (kind === "paid_candidate") {
        return { ...base, ref: String(obj.id ?? ""), paymentId: obj.metadata?.payment_id ?? obj.client_reference_id ?? null, paid: obj.payment_status === "paid" };
      }
      if (kind === "failed") {
        return { ...base, ref: String(obj.id ?? ""), paymentId: obj.metadata?.payment_id ?? obj.client_reference_id ?? null };
      }
      if (kind === "refunded") {
        // Só devolução total conta; devolução parcial não fecha nada.
        const full = obj.refunded === true || (Number(obj.amount_refunded) > 0 && Number(obj.amount_refunded) >= Number(obj.amount));
        return { ...base, ref: null, paymentId: obj.metadata?.payment_id ?? null, fullyRefunded: full };
      }
      return base;
    },

    // ---------- conta de recebimento da casa ----------
    async onboardAccount({ existingAccount, house, userId, email, appUrl }) {
      let account = existingAccount ?? null;
      if (!account) {
        const base = {
          contact_email: email,
          display_name: house.name,
          dashboard: "full",
          identity: { country: "br" },
          defaults: { currency: "brl", locales: ["pt-BR"], responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
          metadata: { house_id: house.id, owner_id: userId },
          include: ["configuration.merchant", "identity", "requirements"],
          // Pix não é capacidade da API v2: é pedido depois, pela API v1, em accountStatus.
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        };
        const acct = await call("/v2/core/accounts", { body: base, idem: `acct_${house.id}_card` });
        account = String(acct.id);
      }
      const link = await call("/v2/core/account_links", {
        body: {
          account,
          use_case: { type: "account_onboarding", account_onboarding: { return_url: `${appUrl}/pagamento/conta?s=ok`, refresh_url: `${appUrl}/pagamento/conta?s=refresh` } },
        },
      });
      return { account, created: !existingAccount, url: link.url };
    },

    async accountStatus({ account }) {
      const acct = await call(`/v2/core/accounts/${account}?include[0]=configuration.merchant&include[1]=requirements`);
      const st = accountState(acct);
      let pix = null;
      if (st.charges_enabled) {
        try {
          const v1 = await call(`/v1/accounts/${account}`);
          pix = v1?.capabilities?.pix_payments ?? null;
          if (pix === null) {
            const upd = await call(`/v1/accounts/${account}`, { form: { capabilities: { pix_payments: { requested: true } } } });
            pix = upd?.capabilities?.pix_payments ?? "requested";
          }
        } catch (e) {
          log.error("pix_request_failed", String(e));
          pix = "error";
        }
      }
      if (pix === "active") await ensurePixOn(account);
      return { ...st, pix_status: pix };
    },
  };
}
