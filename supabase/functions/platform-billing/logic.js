// Regras puras da Cobrança da Plataforma no Stripe (sem rede, sem Deno): montagem do pedido, valor da tarifa, assinatura do aviso.
const KINDS_BY_METHOD = { card: "card", card_recurring: "card", pix: "pix" };

export function encodeForm(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? encodeForm(x, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`)));
    else if (typeof v === "object") encodeForm(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
export const formBody = (obj) => encodeForm(obj).join("&");

/** Meios aceitos pelo painel -> tipos do Stripe, sem repetir. Só 'card' e 'pix' existem no Stripe; 'card_recurring' guarda o cartão para cobrar de novo. */
export function stripeMethodTypes(methods) {
  const types = [];
  for (const m of methods ?? []) {
    const t = KINDS_BY_METHOD[m];
    if (t && !types.includes(t)) types.push(t);
  }
  return types;
}

/** A página de pagamento vale de 30 min a 24 h no Stripe; o Pix pode durar até o fim da sessão. */
export function checkoutExpiry(nowMs = Date.now(), hours = 23) {
  return Math.floor(nowMs / 1000) + Math.round(hours * 3600);
}

/** Pedido da página de pagamento. O valor vem SEMPRE da fatura (banco), nunca da pessoa. */
export function buildCheckoutParams({ charge, methods, appUrl, email, expiresAtSec }) {
  const types = stripeMethodTypes(methods);
  if (!types.length) throw new Error("Nenhum meio de pagamento disponível.");
  const params = {
    mode: "payment",
    locale: "pt-BR",
    allowed_payment_method_types: types, // a versão nova da API não aceita mais payment_method_types: o filtro é este
    client_reference_id: charge.id,
    metadata: { charge_id: charge.id, house_id: charge.house_id, kind: charge.kind },
    line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: Number(charge.amount_cents), product_data: { name: String(charge.description || "Ilê Conecta").slice(0, 120) } } }],
    payment_intent_data: { description: `Ilê Conecta — ${charge.description || charge.kind}`.slice(0, 300), metadata: { charge_id: charge.id } },
    success_url: `${appUrl}/planos?fatura=${charge.id}&retorno=pago`,
    cancel_url: `${appUrl}/planos?fatura=${charge.id}&retorno=cancelado`,
    expires_at: expiresAtSec,
  };
  if (email) params.customer_email = email;
  if (types.includes("pix")) params.payment_method_options = { pix: { expires_after_seconds: Math.max(60, Math.min(86400, expiresAtSec - Math.floor(Date.now() / 1000))) } };
  return params;
}

/**
 * Tarifa do Stripe a partir do lançamento do saldo. Desconhecida = null, NUNCA zero:
 * só vale se o detalhamento fecha com o total, ou se há item stripe_fee explícito, ou se o total é 0 de forma explícita.
 */
export function feeFromBalanceTransaction(bt) {
  if (!bt || typeof bt !== "object") return null;
  const details = bt.fee_details;
  if (!Array.isArray(details)) return null;
  if (!details.every((d) => d && Number.isFinite(Number(d.amount)))) return null;
  if (Number.isFinite(Number(bt.fee)) && details.reduce((a, d) => a + Number(d.amount), 0) !== Number(bt.fee)) return null;
  const stripeEntries = details.filter((d) => d.type === "stripe_fee");
  const fee = stripeEntries.reduce((a, d) => a + Number(d.amount), 0);
  if (fee === 0 && !stripeEntries.length && !(typeof bt.fee === "number" && bt.fee === 0)) return null;
  return fee;
}

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
function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Assinatura do aviso (HMAC-SHA256) com janela de 5 minutos. */
export async function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now(), toleranceSec = 300) {
  const { t, v1 } = parseSignature(header);
  if (!secret || !t || v1.length === 0) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return v1.some((sig) => sig.length === mac.length && timingSafeEqual(sig, mac));
}

/** Avisos de cobrança automática (payment_intent) só valem quando o pagamento foi criado por nós (metadata.auto = "1"). */
export function classifyEvent(type, object = null) {
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") return "paid_candidate";
  if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") return "failed";
  // Recusa de cobrança automática é tratada na hora pela rotina (a tentativa fica registrada); só o "pago" chega por aviso (ex.: Pix/cartão em análise).
  if (type === "payment_intent.succeeded") return object?.metadata?.auto === "1" ? "paid_candidate" : "ignore";
  return "ignore";
}

/** Cadastro do cartão (sem cobrar): Checkout em modo "setup", só cartão, vinculado ao cliente da casa. */
export function buildCardSetupParams({ customer, houseId, appUrl, expiresAtSec }) {
  return {
    mode: "setup",
    locale: "pt-BR",
    customer,
    currency: "brl",
    allowed_payment_method_types: ["card"],
    client_reference_id: houseId,
    metadata: { house_id: houseId, purpose: "card_on_file" },
    success_url: `${appUrl}/planos?cartao=ok&sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/planos?cartao=cancelado`,
    expires_at: expiresAtSec,
  };
}

/** Cobrança sem a pessoa presente (cartão salvo). O valor vem da fatura, nunca de fora. */
export function buildAutoChargeParams({ charge, customer, method, attempt }) {
  return {
    amount: Number(charge.amount_cents),
    currency: "brl",
    customer,
    payment_method: method,
    allowed_payment_method_types: ["card"], // nesta versão do Stripe o campo se chama allowed_payment_method_types
    off_session: "true",
    confirm: "true",
    description: `Ilê Conecta — ${charge.description || charge.kind} (cobrança automática)`.slice(0, 300),
    metadata: { charge_id: charge.id, house_id: charge.house_id, auto: "1", attempt: String(attempt) },
  };
}

/**
 * Resultado de uma cobrança automática a partir da resposta do Stripe.
 * Só 'aprovada' | 'processando' | 'recusada' | 'exige_acao' são desfechos; qualquer outra coisa (erro de rede, 5xx, 429,
 * parâmetro inválido) é NULL = "não sabemos": a tentativa fica aberta e repete com a mesma chave (sem cobrar duas vezes).
 */
export function interpretAutoCharge({ ok, status, data }) {
  if (ok) {
    if (data?.status === "succeeded") return { outcome: "aprovada", ref: String(data.id), code: null };
    if (data?.status === "processing") return { outcome: "processando", ref: String(data.id), code: null };
    if (data?.status === "requires_action" || data?.status === "requires_confirmation") return { outcome: "exige_acao", ref: String(data.id), code: "authentication_required", cancel: String(data.id) };
    if (data?.status === "requires_payment_method") return { outcome: "recusada", ref: String(data.id), code: "payment_failed" };
    return null;
  }
  const err = data?.error;
  if (status === 402 && err?.type === "card_error") {
    const pi = err.payment_intent?.id ? String(err.payment_intent.id) : null;
    if (err.code === "authentication_required") return { outcome: "exige_acao", ref: pi, code: "authentication_required", cancel: pi };
    return { outcome: "recusada", ref: pi, code: String(err.decline_code || err.code || "card_declined").slice(0, 60) };
  }
  return null;
}

export const CREDIT_PACKS = ["p80", "p200", "p500"];

const CREDIT_ERRORS = [
  [/cobranca_desligada/, "A compra de créditos ainda não está disponível."],
  [/Pacote inválido/, "Pacote inválido."],
  [/não inclui a assistente/, "O plano da casa não inclui a assistente."],
  [/Regularize a fatura em atraso/, "Regularize a fatura em atraso para comprar créditos."],
];

/** Mensagem do banco → texto para a casa. Só frases conhecidas passam; o resto vira mensagem genérica (nada técnico vaza). */
export function creditPurchaseError(message) {
  const m = String(message ?? "");
  for (const [re, text] of CREDIT_ERRORS) if (re.test(m)) return text;
  return "Não foi possível iniciar a compra agora. Tente de novo.";
}

/**
 * Resposta do Stripe a um pedido de estorno. 'done' = o provedor aceitou (estorno de Pix pode ficar "pending" por um tempo: o dinheiro já está a caminho).
 * 'failed' só para recusa definitiva e segura (pedido inválido). Qualquer outra coisa (rede, 5xx, 429, chave repetida, estorno já feito por fora) é NULL:
 * o reembolso fica pendente e a rotina repete com a mesma chave, sem estornar duas vezes e sem devolver o saldo por engano.
 */
export function interpretRefund({ ok, status, data }) {
  if (ok) {
    if (data?.status === "succeeded" || data?.status === "pending" || data?.status === "requires_action") return { outcome: "done", ref: String(data.id) };
    if (data?.status === "failed" || data?.status === "canceled") return { outcome: "failed", code: String(data.failure_reason || data.status).slice(0, 60) };
    return null;
  }
  const err = data?.error;
  if ((status === 400 || status === 404) && err?.type === "invalid_request_error" && err?.code !== "charge_already_refunded") {
    return { outcome: "failed", code: String(err.code || err.param || "invalid_request").slice(0, 60) };
  }
  return null;
}
