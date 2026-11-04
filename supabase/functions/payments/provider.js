// Contrato dos provedores de pagamento (sem rede, sem Deno): o núcleo financeiro só conversa com isto.
// Hoje só o Stripe está registrado e ativo. Outro provedor entra implementando o mesmo contrato, sem mexer no núcleo.
//
// Vocabulário do contrato:
//  - ref      : identificador da cobrança no provedor (ex.: sessão de checkout). Fica em payments.provider_ref.
//  - account  : conta de origem do recebimento no provedor (ex.: conta conectada da casa). Fica em payments.stripe_account_id.
//  - provider : id do provedor ("stripe"). Fica em payments.provider e NUNCA muda depois que o pagamento existe.

export class ProviderError extends Error {
  constructor(message, code = "provider_error") {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

/** O aviso/pedido não bate com o provedor, a referência ou a conta registrados na transação. Não adianta tentar de novo. */
export class DivergenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "DivergenceError";
  }
}

/** Operações que todo adaptador precisa oferecer. */
export const PROVIDER_METHODS = [
  "createCheckout", // ({ payment, title, appUrl, clientEmail, account, expiresAt }) -> { ref, url }
  "getCheckout", // ({ ref, account }) -> { ref, status, url, paid, paymentRef }
  "refund", // ({ ref, account, correlation, idempotencyKey }) -> { refundRef, status, reused }
  "fetchFees", // ({ ref, account }) -> { feeCents, method }
  "verifyWebhook", // (rawBody, headers) -> Promise<boolean>
  "parseEvent", // (event) -> { id, kind, account, paymentId, ref, paid, fullyRefunded }
  "onboardAccount", // ({ existingAccount, house, userId, email, appUrl }) -> { account, url }
  "accountStatus", // ({ account }) -> { charges_enabled, payouts_enabled, requirements_due, pix_status }
];

export function assertProvider(adapter) {
  if (!adapter || typeof adapter.id !== "string" || !adapter.id) throw new ProviderError("Adaptador sem identificador.", "invalid_adapter");
  for (const m of PROVIDER_METHODS) {
    if (typeof adapter[m] !== "function") throw new ProviderError(`Adaptador "${adapter.id}" não implementa ${m}.`, "invalid_adapter");
  }
  return adapter;
}

/**
 * Registro de provedores.
 *  - adapters: lista de adaptadores (todos conhecidos, inclusive os que só atendem pagamentos antigos).
 *  - active  : ids que podem abrir NOVAS cobranças e novos cadastros de recebimento.
 */
export function createRegistry(adapters, active) {
  const byId = new Map();
  for (const a of adapters) {
    assertProvider(a);
    if (byId.has(a.id)) throw new ProviderError(`Provedor "${a.id}" registrado duas vezes.`, "duplicate_adapter");
    byId.set(a.id, a);
  }
  const activeIds = new Set(active);
  for (const id of activeIds) if (!byId.has(id)) throw new ProviderError(`Provedor ativo "${id}" não está registrado.`, "unknown_provider");
  return {
    ids: () => [...byId.keys()],
    isActive: (id) => activeIds.has(id),
    /** Adaptador do provedor REGISTRADO na transação. Nunca escolhe outro no lugar. */
    forPayment(payment) {
      const id = payment?.provider;
      if (!id) throw new ProviderError("Pagamento sem provedor registrado.", "no_provider");
      const a = byId.get(id);
      if (!a) throw new ProviderError(`Provedor "${id}" não disponível.`, "unknown_provider");
      return a;
    },
    /** Adaptador para abrir algo novo (cadastro de recebimento ou primeira cobrança): só provedor ativo. */
    forNew(id) {
      if (!activeIds.has(id)) throw new ProviderError(`Provedor "${id}" não está ativo.`, "inactive_provider");
      return byId.get(id);
    },
    byId: (id) => byId.get(id) ?? null,
  };
}

/**
 * Confere se um aviso ou pedido pertence mesmo à transação: provedor, referência e conta de origem registrados.
 * A conta, quando registrada, precisa ser igual (ausente no aviso também é divergência).
 */
export function assertSameTransaction(payment, { provider, ref, account }) {
  if (!payment) throw new DivergenceError("Pagamento não encontrado.");
  if (payment.provider !== provider) throw new DivergenceError("Provedor diferente do registrado na transação.");
  if (ref !== undefined && ref !== null && payment.provider_ref !== ref) throw new DivergenceError("Referência diferente da registrada na transação.");
  if (payment.stripe_account_id && payment.stripe_account_id !== account) throw new DivergenceError("Conta de origem diferente da registrada na transação.");
}
