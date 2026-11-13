// Núcleo da Cobrança da Plataforma: abre o pagamento de uma fatura, trata avisos do provedor e roda a rotina diária.
// Não conhece Stripe nem Supabase: fala com o provedor REGISTRADO (registry) e com o banco por "portas" (store). Testável em Node.
// Regras que valem aqui: o valor vem sempre da fatura; o aviso do provedor só diz ONDE olhar, a verdade é consultada de novo;
// a confirmação financeira é uma função atômica do banco; tarifa desconhecida fica nula (nunca zero).
import { ChargeStateError, DivergenceError } from "./provider.js";
import { checkoutExpiry } from "./logic.js";

const msg = (e) => String(e?.message ?? e).slice(0, 300);
const DB_DIVERGENCE = /valor_divergente|cobranca_cancelada|cobranca_desconhecida|tarifa_invalida|referencia_de_outra_fatura/;

// ---------- pagar uma fatura (ação da casa) ----------
export async function openPayment({ registry, store, chargeId, userId, method = null, email, appUrl, nowMs = Date.now(), log = console }) {
  const cfg = await store.config();
  if (cfg?.enabled !== true) throw new ChargeStateError("A cobrança da plataforma ainda não está ativa.", "disabled");
  const charge = await store.chargeById(chargeId);
  if (!charge) throw new ChargeStateError("Fatura não encontrada.", "not_found");
  if ((await store.houseOwner(charge.house_id)) !== userId) throw new ChargeStateError("Esta fatura não é da sua casa.", "forbidden");
  if (charge.status === "paga") throw new ChargeStateError("Esta fatura já foi paga.", "paid");
  if (charge.status === "cancelada" || charge.status === "estornada") throw new ChargeStateError("Esta fatura foi cancelada.", "cancelled");
  if (charge.status === "em_processamento") throw new ChargeStateError("Seu pagamento está em análise. Assim que for confirmado, a fatura é baixada sozinha.", "processing");

  const providerId = cfg.provider?.[charge.kind];
  const adapter = providerId ? registry.byId(providerId) : null;
  if (!adapter) throw new ChargeStateError("O meio de pagamento está indisponível no momento. Tente de novo mais tarde.", "provider_unavailable");
  const allowed = Array.isArray(cfg.methods?.[charge.kind]) ? cfg.methods[charge.kind] : [];
  if (method && !allowed.includes(method)) throw new ChargeStateError("Esse meio de pagamento não está disponível para esta fatura.", "method_unavailable");
  const methods = method ? [method] : allowed;
  if (!methods.length) throw new ChargeStateError("Nenhum meio de pagamento disponível para esta fatura.", "method_unavailable");

  // Página já aberta e ainda válida para a mesma escolha: reaproveita (clique repetido não cria outra).
  if (charge.provider_ref && charge.provider === adapter.id) {
    const cur = await adapter.getCheckout({ ref: charge.provider_ref });
    if (cur.paid || cur.pending) {
      await settleRef({ store, adapter, ref: charge.provider_ref, hint: null, log });
      throw new ChargeStateError(cur.paid ? "Esta fatura já foi paga." : "Seu pagamento está em análise. Assim que for confirmado, a fatura é baixada sozinha.", cur.paid ? "paid" : "processing");
    }
    if (cur.status === "open" && cur.url && (charge.provider_method ?? null) === (methods.length === 1 ? methods[0] : null)) return { url: cur.url, reused: true };
  }

  const attempt = await store.refCount(charge.id);
  // A validade (expires_at) faz parte do pedido e muda a cada segundo. O Stripe recusa a mesma chave com parâmetros
  // diferentes, então a validade entra na chave: repetir o mesmo pedido (mesma validade) continua idempotente,
  // e uma nova tentativa depois de uma falha antes de gravar a página nunca bate no erro "chave já usada".
  const expiresAtSec = checkoutExpiry(nowMs);
  const session = await adapter.createCheckout({
    charge, methods, appUrl, email, expiresAtSec,
    idempotencyKey: `pb:${charge.id}:${attempt}:${methods.join("+")}:${expiresAtSec}`,
  });
  try {
    await store.attach(charge.id, adapter.id, session.ref, session.method ?? (methods.length === 1 ? methods[0] : null), session.url);
  } catch (e) {
    log.error("attach_failed", charge.id, msg(e));
    throw new ChargeStateError("Não foi possível abrir o pagamento agora. Tente de novo.", "attach_failed");
  }
  return { url: session.url, reused: false };
}

// ---------- conferir uma referência no provedor e refletir no banco ----------
/** hint: "failed" quando o aviso diz que a tentativa falhou. Devolve { outcome }. */
export async function settleRef({ store, adapter, ref, hint = null, log = console }) {
  const chargeId = await store.chargeIdByRef(adapter.id, ref);
  if (!chargeId) throw new DivergenceError(`cobranca_desconhecida: ${String(ref).slice(0, 80)}`);
  const s = await adapter.getCheckout({ ref });
  try {
    if (s.paid) {
      const charge = await store.chargeById(chargeId);
      if (s.currency !== "brl" || s.amountCents !== Number(charge.amount_cents)) throw new DivergenceError(`valor_divergente: provedor ${s.amountCents} ${s.currency}, fatura ${charge.amount_cents}`);
      const res = await store.confirm(adapter.id, ref, s.amountCents, s.feeCents ?? null);
      return { outcome: res?.duplicate ? "duplicate" : "paid", charge: chargeId };
    }
    if (hint === "failed" || s.status === "expired") {
      await store.progress(adapter.id, ref, "failed");
      return { outcome: "failed", charge: chargeId };
    }
    if (s.pending) {
      await store.progress(adapter.id, ref, "processing");
      return { outcome: "processing", charge: chargeId };
    }
    return { outcome: "open", charge: chargeId };
  } catch (e) {
    if (e instanceof DivergenceError) throw e;
    if (DB_DIVERGENCE.test(msg(e))) throw new DivergenceError(msg(e));
    log.error("settle_failed", chargeId, msg(e));
    throw e;
  }
}

/** A casa voltou da página de pagamento: confere agora, sem esperar o aviso (rede de segurança). */
export async function syncCharge({ registry, store, chargeId, userId, log = console }) {
  const charge = await store.chargeById(chargeId);
  if (!charge) throw new ChargeStateError("Fatura não encontrada.", "not_found");
  if ((await store.houseOwner(charge.house_id)) !== userId) throw new ChargeStateError("Esta fatura não é da sua casa.", "forbidden");
  const adapter = charge.provider ? registry.byId(charge.provider) : null;
  if (adapter && charge.provider_ref && (charge.status === "aberta" || charge.status === "vencida" || charge.status === "em_processamento")) {
    try {
      await settleRef({ store, adapter, ref: charge.provider_ref, log });
    } catch (e) {
      if (!(e instanceof DivergenceError)) throw e;
    }
  }
  const now = await store.chargeById(chargeId);
  return { status: now.status };
}

// ---------- avisos do provedor ----------
/**
 * Confere a assinatura, registra o aviso (uma linha por aviso, imutável) e trata. Tratar duas vezes é seguro:
 * a confirmação no banco é atômica e idempotente. Devolve { status, body } para a camada HTTP.
 *  - assinatura ruim -> 400; ilegível -> 400
 *  - já concluído antes -> 200 (duplicado)
 *  - divergência (fatura desconhecida, valor ou moeda diferentes) -> 200, registrada como rejeitada (reenviar não resolve)
 *  - falha temporária -> 500 (o provedor reenvia)
 */
export async function processWebhook({ registry, store, providerId, rawBody, headers, log = console }) {
  const adapter = registry.byId(providerId);
  if (!adapter) return { status: 400, body: { error: "Provedor desconhecido." } };
  if (!(await adapter.verifyWebhook(rawBody, headers))) return { status: 400, body: { error: "Assinatura inválida." } };
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return { status: 400, body: { error: "Aviso ilegível." } };
  }
  const ev = adapter.parseEvent(event);
  if (!ev.id) return { status: 400, body: { error: "Aviso sem identificador." } };
  if (await store.eventSeen(adapter.id, `${ev.id}:ok`) || await store.eventSeen(adapter.id, `${ev.id}:rej`)) return { status: 200, body: { received: true, duplicate: true } };
  await store.logEvent({ provider: adapter.id, event_id: ev.id, kind: ev.type || "aviso", outcome: "recebido" }).catch((e) => log.error("log_received_failed", msg(e)));
  if (ev.kind === "ignore" || !ev.ref) return { status: 200, body: { received: true, ignored: true } };
  try {
    const r = await settleRef({ store, adapter, ref: ev.ref, hint: ev.kind === "failed" ? "failed" : null, log });
    await store.logEvent({ provider: adapter.id, event_id: `${ev.id}:ok`, kind: ev.type, charge_id: r.charge, outcome: "processado", reason: r.outcome });
    return { status: 200, body: { received: true, outcome: r.outcome } };
  } catch (e) {
    if (e instanceof DivergenceError) {
      log.error("event_rejected", ev.id, msg(e));
      await store.logEvent({ provider: adapter.id, event_id: `${ev.id}:rej`, kind: ev.type, outcome: "rejeitado", reason: msg(e) }).catch(() => {});
      return { status: 200, body: { received: true, rejected: true } };
    }
    log.error("event_failed", ev.id, msg(e));
    return { status: 500, body: { error: "Falha ao processar." } };
  }
}

// ---------- cartão salvo da casa ----------
const CARD_ERRORS = [
  [/Cadastre um cartão/, "Cadastre um cartão antes de ligar a cobrança automática."],
  [/não confere|desconhecido|outra casa/, "Não foi possível confirmar o cartão. Tente cadastrar de novo."],
];
const cardError = (e) => {
  for (const [re, text] of CARD_ERRORS) if (re.test(msg(e))) return new ChargeStateError(text, "card_state");
  return e;
};

async function cardContext({ registry, store, userId }) {
  const houseId = await store.houseOfOwner(userId);
  if (!houseId) throw new ChargeStateError("Somente a casa cadastra cartão.", "forbidden");
  const cfg = await store.config();
  const adapter = cfg?.provider?.plan ? registry.byId(cfg.provider.plan) : null;
  if (!adapter || typeof adapter.createCardSetup !== "function") throw new ChargeStateError("O meio de pagamento está indisponível no momento. Tente de novo mais tarde.", "provider_unavailable");
  return { houseId, adapter };
}

/** Passo 1: abre a página segura do provedor para a casa cadastrar o cartão (nada é cobrado). */
export async function cardSetup({ registry, store, userId, email, appUrl, nowMs = Date.now() }) {
  if ((await store.autoEnabled()) !== true) throw new ChargeStateError("A cobrança automática no cartão não está disponível.", "disabled");
  const { houseId, adapter } = await cardContext({ registry, store, userId });
  const current = await store.cardGet(houseId);
  let customer = current?.customer ?? null;
  if (!customer) customer = await adapter.ensureCustomer({ houseId, email, idempotencyKey: `pbcus:${houseId}` });
  try {
    customer = await store.cardCustomer(houseId, adapter.id, customer); // o banco guarda o primeiro e devolve sempre o mesmo
  } catch (e) {
    throw cardError(e);
  }
  const s = await adapter.createCardSetup({ customer, houseId, appUrl, expiresAtSec: checkoutExpiry(nowMs) });
  await store.cardSetupOpen(houseId, adapter.id, s.ref);
  return { url: s.url };
}

/** Passo 2: a casa voltou da página do provedor; confere lá (não confia no endereço de retorno) e guarda o cartão. */
export async function cardSync({ registry, store, userId, sessionRef, log = console }) {
  const { houseId, adapter } = await cardContext({ registry, store, userId });
  const s = await adapter.getCardSetup({ ref: sessionRef });
  if (!s.complete || !s.method || !s.customer) throw new ChargeStateError("O cadastro do cartão não foi concluído.", "card_state");
  if (s.houseId !== houseId) throw new ChargeStateError("Este cadastro não é da sua casa.", "forbidden");
  let saved;
  try {
    saved = await store.cardSave(houseId, adapter.id, sessionRef, s.customer, s.method);
  } catch (e) {
    throw cardError(e);
  }
  if (saved?.previous_method && saved.previous_method !== s.method.id) await adapter.detachCard({ method: saved.previous_method }).catch((e) => log.error("detach_failed", msg(e)));
  return { ok: true };
}

export async function cardSetAuto({ registry, store, userId, enabled }) {
  const { houseId } = await cardContext({ registry, store, userId });
  try {
    return { auto_enabled: await store.cardSetAuto(houseId, enabled === true) };
  } catch (e) {
    throw cardError(e);
  }
}

export async function cardRemove({ registry, store, userId, log = console }) {
  const { houseId, adapter } = await cardContext({ registry, store, userId });
  const method = await store.cardRemove(houseId); // o banco limpa primeiro: mesmo que o provedor falhe, nada mais é cobrado
  if (method) await adapter.detachCard({ method }).catch((e) => log.error("detach_failed", msg(e)));
  return { ok: true };
}

// ---------- cobrança automática (cartão salvo) ----------
/** Uma tentativa por fatura por dia, no máximo 3. Falha de rede deixa a tentativa aberta e repete com a MESMA chave (nunca cobra duas vezes). */
export async function autoCharge({ registry, store, nowMs = Date.now(), limit = 50, log = console }) {
  const out = { due: 0, approved: 0, declined: 0, pending: 0, errors: [] };
  const nowIso = new Date(nowMs).toISOString();
  const list = (await store.autoDue(nowIso)) ?? [];
  for (const d of list.slice(0, limit)) {
    out.due++;
    const adapter = registry.byId(d.provider);
    if (!adapter || typeof adapter.chargeSaved !== "function") continue;
    try {
      if ((await store.autoBegin(d.charge_id, d.attempt, nowIso)) !== true) continue;
      const charge = await store.chargeById(d.charge_id);
      if (!charge || Number(charge.amount_cents) !== Number(d.amount_cents)) throw new Error("valor_divergente");
      const r = await adapter.chargeSaved({ charge, customer: d.customer_ref, method: d.method_ref, attempt: d.attempt, idempotencyKey: `pbauto:${charge.id}:${d.attempt}` });
      if (!r) { out.errors.push(`fatura ${d.charge_id}: sem resposta do provedor`); continue; }
      if ((r.outcome === "aprovada" || r.outcome === "processando") && r.ref) {
        try {
          await store.attach(charge.id, adapter.id, r.ref, "card_recurring", null);
          await settleRef({ store, adapter, ref: r.ref, log });
        } catch (e) {
          // O dinheiro foi cobrado, mas a fatura não pôde ser baixada (ex.: foi paga por outro meio no meio da tentativa).
          log.error("auto_settle_failed", charge.id, msg(e));
          await store.logEvent({ provider: adapter.id, event_id: `auto:${r.ref}:dup`, kind: "pagamento_duplicado", charge_id: charge.id, outcome: "rejeitado", reason: msg(e) }).catch(() => {});
          out.errors.push(`fatura ${d.charge_id}: cobrança sem baixa (${msg(e)})`);
        }
      }
      await store.autoResult(charge.id, d.attempt, r.outcome, r.ref ?? null, r.code ?? null);
      if (r.outcome === "aprovada") out.approved++;
      else if (r.outcome === "processando") out.pending++;
      else out.declined++;
    } catch (e) {
      out.errors.push(`fatura ${d.charge_id}: ${msg(e)}`);
    }
  }
  return out;
}

// ---------- rotina diária ----------
/** Emite/avisa/suspende (banco), confere no provedor o que ficou sem resposta e completa a tarifa dos pagamentos já feitos. */
export async function sweep({ registry, store, limit = 50, nowMs = Date.now(), log = console }) {
  const out = { tick: null, auto: null, checked: 0, settled: 0, fees: 0, errors: [] };
  try {
    out.tick = await store.tick();
  } catch (e) {
    out.errors.push(`tick: ${msg(e)}`);
  }
  try {
    out.auto = await autoCharge({ registry, store, nowMs, log });
    for (const x of out.auto.errors) out.errors.push(`auto: ${x}`);
  } catch (e) {
    out.errors.push(`auto: ${msg(e)}`);
  }
  try {
    for (const c of await store.openWithRef(limit)) {
      const adapter = registry.byId(c.provider);
      if (!adapter) continue;
      out.checked++;
      try {
        const r = await settleRef({ store, adapter, ref: c.provider_ref, log });
        if (r.outcome !== "open") out.settled++;
      } catch (e) {
        out.errors.push(`fatura ${c.id}: ${msg(e)}`);
      }
    }
    for (const c of await store.paidWithoutFee(limit)) {
      const adapter = registry.byId(c.provider);
      if (!adapter || !c.paid_ref) continue;
      try {
        const s = await adapter.getCheckout({ ref: c.paid_ref });
        if (s.paid && s.feeCents != null && (await store.recordFee(adapter.id, c.paid_ref, s.feeCents))) out.fees++;
      } catch (e) {
        out.errors.push(`tarifa ${c.id}: ${msg(e)}`);
      }
    }
  } catch (e) {
    out.errors.push(`varredura: ${msg(e)}`);
  }
  return out;
}
