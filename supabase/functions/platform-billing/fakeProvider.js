// Provedor de teste (em memória, sem rede): permite simular Pix que expira, pagamento assíncrono, falha e aviso repetido.
import { ProviderError } from "./provider.js";

export function createFakeProvider({ id = "fake", now = () => Date.now() } = {}) {
  const sessions = new Map();
  let n = 0;
  return {
    id,
    sessions,
    calls: { createCheckout: 0, getCheckout: 0 },

    async createCheckout({ charge, methods, expiresAtSec, idempotencyKey }) {
      this.calls.createCheckout++;
      // Como o Stripe: a mesma chave só vale para o mesmo pedido (mesma validade e meios).
      for (const s of sessions.values()) {
        if (s.idem !== idempotencyKey) continue;
        if (s.expiresAtSec !== expiresAtSec || JSON.stringify(s.methods) !== JSON.stringify(methods)) {
          throw new ProviderError("Keys for idempotent requests can only be used with the same parameters they were first used with.", "idempotency_error");
        }
        return { ref: s.ref, url: s.url, method: s.method };
      }
      n++;
      const ref = `${id}_cs_${n}`;
      const s = { ref, url: `https://pay.example/${ref}`, idem: idempotencyKey, chargeId: charge.id, amountCents: Number(charge.amount_cents), currency: "brl", methods, method: (methods ?? []).length === 1 ? methods[0] : null, expiresAtSec, state: "open", paid: false, pending: false, feeCents: null };
      sessions.set(ref, s);
      return { ref, url: s.url, method: s.method };
    },

    async getCheckout({ ref }) {
      this.calls.getCheckout++;
      const s = sessions.get(ref);
      if (!s) throw new ProviderError("Sessão desconhecida.", "not_found");
      const expired = s.state === "open" && s.expiresAtSec * 1000 <= now();
      return { ref, status: expired ? "expired" : s.state, url: s.url, paid: s.paid, pending: s.pending, amountCents: s.amountCents, currency: s.currency, feeCents: s.paid ? s.feeCents : null };
    },

    verifyWebhook(_raw, headers) {
      const h = typeof headers?.get === "function" ? headers.get("x-fake-signature") : headers?.["x-fake-signature"];
      return h === "ok";
    },

    parseEvent(event) {
      const kind = event?.type === "paid" ? "paid_candidate" : event?.type === "failed" ? "failed" : "ignore";
      return { id: String(event?.id ?? ""), type: String(event?.type ?? ""), kind, ref: event?.ref ?? null };
    },

    // ---- controles do teste ----
    markPaid(ref, { feeCents = null, amountCents } = {}) { const s = sessions.get(ref); s.state = "complete"; s.paid = true; s.pending = false; s.feeCents = feeCents; if (amountCents != null) s.amountCents = amountCents; },
    markPending(ref) { const s = sessions.get(ref); s.state = "complete"; s.paid = false; s.pending = true; },
    markExpired(ref) { sessions.get(ref).state = "expired"; },
    setFee(ref, feeCents) { sessions.get(ref).feeCents = feeCents; },
  };
}
