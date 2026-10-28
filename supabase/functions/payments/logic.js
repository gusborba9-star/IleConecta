// Regras puras das funções de pagamento (sem rede, sem Deno): testáveis em Node.

/** Objeto -> corpo "application/x-www-form-urlencoded" no estilo do Stripe (a[b][0][c]=1). */
export function encodeForm(obj, prefix = "", out = []) {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => encodeForm(v, `${prefix}[${i}]`, out));
  } else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(obj))}`);
  }
  return out;
}
export const formBody = (obj) => encodeForm(obj).join("&");

/** Corpo da sessão de pagamento (cobrança direta na conta da casa, com a comissão da plataforma). */
export function buildCheckoutParams({ payment, title, appUrl, clientEmail, expiresAt }) {
  const gross = Number(payment.gross_cents);
  const fee = Number(payment.fee_cents);
  if (!Number.isInteger(gross) || gross < 100) throw new Error("Valor inválido.");
  if (!Number.isInteger(fee) || fee < 0 || fee > gross) throw new Error("Comissão inválida.");
  const meta = { payment_id: String(payment.id), kind: payment.reservation_id ? "ritual" : "servico" };
  const params = {
    mode: "payment",
    locale: "pt-BR",
    client_reference_id: String(payment.id),
    line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: gross, product_data: { name: String(title).slice(0, 120) } } }],
    payment_intent_data: { metadata: meta, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
    metadata: meta,
    success_url: `${appUrl}/pagamento/retorno?p=${payment.id}&s=ok`,
    cancel_url: `${appUrl}/pagamento/retorno?p=${payment.id}&s=cancel`,
    expires_at: expiresAt,
  };
  if (clientEmail) params.customer_email = clientEmail;
  return params;
}

/** A sessão pode expirar entre 30 min e 24 h (regra do Stripe). Devolve segundos UNIX. */
export function sessionExpiry(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000) + 31 * 60;
}

/** Cabeçalho Stripe-Signature -> { t, v1[] }. */
export function parseSignature(header) {
  const out = { t: null, v1: [] };
  for (const part of String(header ?? "").split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") out.t = Number(v);
    else if (k === "v1" && v) out.v1.push(v);
  }
  return out;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Confere a assinatura do aviso (HMAC-SHA256) e a janela de 5 minutos. */
export async function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now(), toleranceSec = 300) {
  const { t, v1 } = parseSignature(header);
  if (!secret || !t || v1.length === 0) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return v1.some((sig) => sig.length === mac.length && timingSafeEqual(sig, mac));
}

function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Estado da conta v2 -> o que gravamos. */
export function accountState(acct) {
  const m = acct?.configuration?.merchant?.capabilities ?? {};
  const card = m.card_payments?.status === "active";
  const payouts = m.stripe_balance?.payouts?.status === "active";
  const reqs = acct?.requirements ?? {};
  const due = Array.isArray(reqs.entries) ? reqs.entries.length > 0 : Boolean(reqs.summary?.minimum_deadline);
  return { charges_enabled: card, payouts_enabled: payouts, requirements_due: due };
}

/** Qual aviso muda o quê. */
export function classifyEvent(type) {
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") return "paid_candidate";
  if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") return "failed";
  if (type === "charge.refunded") return "refunded";
  return "ignore";
}
