// Provedor de teste (em memória, sem rede): permite simular Pix que expira, pagamento assíncrono, falha e aviso repetido.
import { ProviderError } from "./provider.js";

export function createFakeProvider({ id = "fake", now = () => Date.now() } = {}) {
  const sessions = new Map();
  let n = 0;
  return {
    id,
    sessions,
    calls: { createCheckout: 0, getCheckout: 0, chargeSaved: 0, detach: 0 },
    detached: [],
    setups: new Map(),
    autoCharges: new Map(), // chave de idempotência -> resultado (como o Stripe: mesma chave, mesmo resultado, sem cobrar de novo)
    autoScript: [], // próximos desfechos: "aprovada" | "recusada" | "exige_acao" | "processando" | "erro"

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

    async ensureCustomer({ houseId }) { return `${id}_cus_${houseId.slice(0, 8)}`; },
    async createCardSetup({ customer, houseId }) {
      const ref = `${id}_seti_${this.setups.size + 1}`;
      this.setups.set(ref, { customer, houseId, complete: false, method: null });
      return { ref, url: `https://pay.example/${ref}` };
    },
    async getCardSetup({ ref }) {
      const s = this.setups.get(ref);
      if (!s) throw new ProviderError("Sessão desconhecida.", "not_found");
      return { complete: s.complete, houseId: s.houseId, customer: s.customer, method: s.complete ? s.method : null };
    },
    async chargeSaved({ charge, customer, method, attempt, idempotencyKey }) {
      this.calls.chargeSaved++;
      if (this.autoCharges.has(idempotencyKey)) return this.autoCharges.get(idempotencyKey);
      const next = this.autoScript.shift() ?? "aprovada";
      if (next === "erro") throw new ProviderError("Falha de rede.", "stripe_error");
      const ref = `${id}_pi_${this.autoCharges.size + 1}`;
      const r = { outcome: next, ref, code: next === "recusada" ? "card_declined" : next === "exige_acao" ? "authentication_required" : null };
      this.autoCharges.set(idempotencyKey, r);
      if (next === "aprovada" || next === "processando") {
        sessions.set(ref, { ref, url: null, idem: null, chargeId: charge.id, amountCents: Number(charge.amount_cents), currency: "brl", methods: ["card"], method: "card", expiresAtSec: 0, state: "complete", paid: next === "aprovada", pending: next === "processando", feeCents: 400 });
      }
      return r;
    },
    async detachCard({ method }) { this.calls.detach++; this.detached.push(method); },

    async getCheckout({ ref }) {
      this.calls.getCheckout++;
      const s = sessions.get(ref);
      if (!s) throw new ProviderError("Sessão desconhecida.", "not_found");
      const expired = s.state === "open" && s.expiresAtSec > 0 && s.expiresAtSec * 1000 <= now();
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
    completeSetup(ref, method = { id: "pm_fake", brand: "visa", last4: "4242", expMonth: 12, expYear: 2031 }) { const s = this.setups.get(ref); s.complete = true; s.method = method; },
    markPaid(ref, { feeCents = null, amountCents } = {}) { const s = sessions.get(ref); s.state = "complete"; s.paid = true; s.pending = false; s.feeCents = feeCents; if (amountCents != null) s.amountCents = amountCents; },
    markPending(ref) { const s = sessions.get(ref); s.state = "complete"; s.paid = false; s.pending = true; },
    markExpired(ref) { sessions.get(ref).state = "expired"; },
    setFee(ref, feeCents) { sessions.get(ref).feeCents = feeCents; },
  };
}
