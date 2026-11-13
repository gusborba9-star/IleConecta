// Contrato dos provedores da Cobrança da Plataforma (casa -> plataforma). Independente do Marketplace: sem conta conectada, sem repasse.
// Um provedor novo entra implementando este contrato e sendo registrado; o núcleo (core.js) não muda.
//
// Vocabulário:
//  - ref      : identificador da página de pagamento no provedor (ex.: sessão de checkout). Fica em platform_charge_refs / platform_charges.provider_ref.
//  - provider : id do provedor ("stripe"). Fica na fatura e nunca é reaproveitado por outro provedor.

export class ProviderError extends Error {
  constructor(message, code = "provider_error") {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

/** O aviso não bate com o que está registrado (fatura desconhecida, valor ou moeda diferentes). Não adianta reenviar. */
export class DivergenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "DivergenceError";
  }
}

/** A fatura não pode abrir pagamento agora (já paga, cancelada, em análise, cobrança desligada...). Mensagem segura para a pessoa. */
export class ChargeStateError extends Error {
  constructor(message, code = "charge_state") {
    super(message);
    this.name = "ChargeStateError";
    this.code = code;
  }
}

export const PROVIDER_METHODS = [
  "createCheckout", // ({ charge, methods, appUrl, email, expiresAtSec, idempotencyKey }) -> { ref, url, method }
  "getCheckout", // ({ ref }) -> { ref, status: "open"|"complete"|"expired", url, paid, pending, amountCents, currency, feeCents|null }
  "verifyWebhook", // (rawBody, headers) -> Promise<boolean>
  "parseEvent", // (event) -> { id, type, kind: "paid_candidate"|"failed"|"ignore", ref }
];

export function assertProvider(adapter) {
  if (!adapter || typeof adapter.id !== "string" || !/^[a-z][a-z0-9_]{1,23}$/.test(adapter.id)) throw new ProviderError("Adaptador sem identificador válido.", "invalid_adapter");
  for (const m of PROVIDER_METHODS) {
    if (typeof adapter[m] !== "function") throw new ProviderError(`Adaptador "${adapter.id}" não implementa ${m}.`, "invalid_adapter");
  }
  return adapter;
}

/** Registro de provedores conhecidos. Faturas existentes seguem o provedor gravado nelas. */
export function createRegistry(adapters) {
  const byId = new Map();
  for (const a of adapters) {
    assertProvider(a);
    if (byId.has(a.id)) throw new ProviderError(`Provedor "${a.id}" registrado duas vezes.`, "invalid_registry");
    byId.set(a.id, a);
  }
  return { byId: (id) => byId.get(id) ?? null, ids: () => [...byId.keys()] };
}
