// Núcleo financeiro: fluxos de cobrança, aviso, reembolso e conciliação de tarifa.
// Não conhece Stripe nem Supabase: fala com o provedor REGISTRADO na transação (registry) e com o banco por "portas" (store).
// Pode ser testado em Node com um provedor e um banco falsos.
import { DivergenceError, ProviderError, assertSameTransaction } from "./provider.js";

const msg = (e) => String(e?.message ?? e).slice(0, 500);

// ---------- avisos do provedor ----------
/**
 * Recebe um aviso: confere a assinatura, "adquire" o evento de forma atômica (só um processo por vez),
 * trata e fecha. Devolve { status, body } para a camada HTTP.
 *  - duplicado já concluído  -> 200
 *  - outro processo está tratando -> 409 (o provedor reenvia depois)
 *  - divergência (provedor/ref/conta) -> 200, evento fechado como rejeitado (não adianta reenviar)
 *  - falha de processamento ou de persistência -> 500 (o provedor reenvia)
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
  if (!event?.id) return { status: 400, body: { error: "Aviso sem identificador." } };

  let acquired;
  try {
    acquired = await store.acquireEvent({ id: event.id, type: event.type, account: event.account ?? null, payload: event });
  } catch (e) {
    log.error("acquire_failed", event.id, msg(e));
    return { status: 500, body: { error: "Falha ao registrar o aviso." } };
  }
  if (acquired === "done") return { status: 200, body: { received: true, duplicate: true } };
  if (acquired !== "acquired") return { status: 409, body: { error: "Aviso em processamento." } };

  try {
    await handleEvent({ registry, store, adapter, event, log });
  } catch (e) {
    const rejected = e instanceof DivergenceError;
    try {
      await store.finishEvent(event.id, rejected ? "rejected" : "retry", msg(e));
    } catch (e2) {
      log.error("finish_failed", event.id, msg(e2));
    }
    if (rejected) {
      log.error("event_rejected", event.id, msg(e));
      return { status: 200, body: { received: true, rejected: true } };
    }
    return { status: 500, body: { error: "Falha ao processar." } };
  }
  try {
    await store.finishEvent(event.id, "done", null);
  } catch (e) {
    // O efeito financeiro já aconteceu e é idempotente: o reenvio, depois que a reserva do evento vencer, apenas repete sem duplicar.
    log.error("finish_failed", event.id, msg(e));
    return { status: 500, body: { error: "Falha ao concluir o aviso." } };
  }
  return { status: 200, body: { received: true } };
}

async function handleEvent({ registry, store, adapter, event, log }) {
  const ev = adapter.parseEvent(event);
  if (ev.kind === "paid_candidate") {
    if (!ev.paid) return; // Pix ainda aguardando: vem outro aviso quando pagar
    const pay = await findPayment(store, adapter.id, ev);
    if (!pay) return;
    assertSameTransaction(pay, { provider: adapter.id, ref: ev.ref, account: ev.account });
    await confirmAndReconcile({ registry, store, pay, log });
  } else if (ev.kind === "failed") {
    const pay = await findPayment(store, adapter.id, ev);
    if (!pay) return;
    assertSameTransaction(pay, { provider: adapter.id, ref: ev.ref, account: ev.account });
    await store.failPending(pay);
  } else if (ev.kind === "refunded") {
    if (!ev.fullyRefunded || !ev.paymentId) return; // devolução parcial não fecha nada
    const pay = await store.paymentById(ev.paymentId);
    if (!pay) return;
    assertSameTransaction(pay, { provider: adapter.id, account: ev.account });
    const rr = await store.approvedRefundRequest(pay.id);
    if (rr) await store.completeRefund(rr.id);
    else if (pay.status === "confirmado") await store.completeCancelRefund(pay.id);
  }
}

/** Acha a transação pelo provedor + referência; se não achar, pelo id da própria transação (e a conferência pega qualquer divergência). */
async function findPayment(store, provider, ev) {
  const byRef = ev.ref ? await store.paymentByRef(provider, ev.ref) : null;
  if (byRef) return byRef;
  return ev.paymentId ? await store.paymentById(ev.paymentId) : null;
}

/**
 * Confirmação financeira primeiro (atômica no banco, não depende de tarifa); conciliação da tarifa do processador depois,
 * sem poder derrubar a confirmação. Uma tarifa que falhar fica para a rotina (reconcileFees).
 */
async function confirmAndReconcile({ registry, store, pay, log }) {
  const res = await store.confirm(pay);
  await reconcileFee({ registry, store, pay, log });
  if (res === "reembolso_pendente" && pay.member_due_id) await refundMemberPayment({ registry, store, paymentId: pay.id, log });
  return res;
}

// ---------- conciliação de tarifa ----------
export async function reconcileFee({ registry, store, pay, log = console }) {
  try {
    if (!pay.provider_ref || !pay.stripe_account_id) return false;
    const adapter = registry.forPayment(pay);
    const fees = await adapter.fetchFees({ ref: pay.provider_ref, account: pay.stripe_account_id });
    if (!fees) return false;
    await store.recordFee(pay, fees);
    return true;
  } catch (e) {
    log.error("record_fee_failed", pay.id, msg(e)); // informativo: não impede a confirmação; a rotina tenta de novo
    return false;
  }
}

/** Rotina: confirmados sem tarifa registrada. */
export async function reconcileFees({ registry, store, limit = 25, log = console }) {
  const list = await store.paymentsMissingFee(limit);
  let done = 0, failed = 0;
  for (const pay of list) (await reconcileFee({ registry, store, pay, log })) ? done++ : failed++;
  return { fees_done: done, fees_failed: failed };
}

// ---------- cobrança ----------
/**
 * Abre (ou reaproveita) a cobrança de um pagamento pendente. Regras:
 *  - o provedor e a conta registrados na transação mandam; nada é trocado em silêncio;
 *  - cobrança nova só por provedor ativo e só quando o pagamento nasceu nesse provedor;
 *  - a conta registrada precisa ser a da casa hoje.
 */
export async function openCheckout({ registry, store, pay, providerId, houseAccount, title, email, appUrl, expiresAt, log = console }) {
  if (pay.provider !== providerId) throw new DivergenceError("Este pagamento pertence a outro provedor.");
  if (pay.stripe_account_id && pay.stripe_account_id !== houseAccount) throw new DivergenceError("A conta de recebimento da casa mudou depois da cobrança aberta.");
  const account = pay.stripe_account_id ?? houseAccount;
  if (pay.provider_ref) {
    try {
      const s = await registry.forPayment(pay).getCheckout({ ref: pay.provider_ref, account });
      if (s.status === "open" && s.url) return { url: s.url };
    } catch (_) { /* cria outra abaixo */ }
  }
  const adapter = registry.forNew(providerId);
  const created = await adapter.createCheckout({
    payment: pay, title, appUrl, clientEmail: email, account, expiresAt, idempotencyKey: `cs_${pay.id}_${pay.provider_ref ?? "0"}`,
  });
  await store.attachCheckout(pay, { provider: adapter.id, ref: created.ref, account });
  return { url: created.url };
}

/** Rede de segurança: confere no provedor se foi pago. */
export async function syncPayment({ registry, store, pay, log = console }) {
  if (pay.status !== "pendente" || !pay.provider_ref || !pay.stripe_account_id) return { status: pay.status };
  const adapter = registry.forPayment(pay);
  const s = await adapter.getCheckout({ ref: pay.provider_ref, account: pay.stripe_account_id });
  if (!s.paid) return { status: pay.status, provider_status: s.paymentStatus };
  assertSameTransaction(pay, { provider: adapter.id, ref: s.ref, account: pay.stripe_account_id });
  const res = await confirmAndReconcile({ registry, store, pay, log });
  if (res === "reembolso_pendente" && pay.member_due_id) return { status: "reembolsado" };
  return { status: "confirmado" };
}

// ---------- reembolso ----------
/**
 * Devolve ao pagador um pedido de reembolso aprovado e fecha o pedido. Devolve a mensagem de erro, ou null.
 * Se o provedor já devolveu numa tentativa anterior (queda entre a devolução e o registro), reaproveita a devolução existente.
 */
export async function executeRefund({ registry, store, rr, log = console }) {
  const pay = await store.paymentById(rr.payment_id);
  if (!pay?.provider_ref || !pay.stripe_account_id) return "Pagamento sem registro no provedor.";
  let result;
  try {
    result = await registry.forPayment(pay).refund({
      ref: pay.provider_ref, account: pay.stripe_account_id,
      correlation: { payment_id: pay.id, refund_request_id: rr.id }, idempotencyKey: `refund_${rr.id}`,
    });
  } catch (e) {
    return msg(e);
  }
  if (result.reused) log.error("refund_reused", pay.id, result.refundRef);
  try {
    await store.completeRefund(rr.id);
  } catch (e) {
    return msg(e);
  }
  return null;
}

/** Devolve todos os pagamentos confirmados de uma reserva/pedido em "reembolso_pendente". */
export async function settleSource({ registry, store, kind, sourceId, log = console }) {
  const pays = await store.confirmedPaymentsOf(kind, sourceId);
  let refunded = 0, failed = 0;
  for (const pay of pays) {
    try {
      if (!pay.provider_ref || !pay.stripe_account_id) { failed++; continue; }
      await registry.forPayment(pay).refund({
        ref: pay.provider_ref, account: pay.stripe_account_id,
        correlation: { payment_id: pay.id, reason: "cancelamento" }, idempotencyKey: `cancel_refund_${pay.id}`,
      });
      await store.completeCancelRefund(pay.id);
      refunded++;
    } catch (e) {
      log.error("settle_failed", pay.id, msg(e));
      failed++;
    }
  }
  return { refunded, failed };
}

/** Pix de mensalidade que chegou depois de a casa marcar o mês: devolve o valor inteiro. */
export async function refundMemberPayment({ registry, store, paymentId, log = console }) {
  try {
    const rr = await store.approvedRefundRequest(paymentId);
    if (rr) {
      const err = await executeRefund({ registry, store, rr, log });
      if (err) log.error("member_refund_failed", paymentId, err);
    }
  } catch (e) {
    log.error("member_refund_failed", paymentId, msg(e)); // fica "aprovado" no painel do admin para reenviar
  }
}

/** Conclui os reembolsos de cancelamento pendentes. `scope` limita a uma pessoa (null = todos). */
export async function settlePending({ registry, store, scope = null, log = console }) {
  const sources = await store.pendingSources(scope, 50);
  let refunded = 0, failed = 0;
  for (const s of sources) {
    const x = await settleSource({ registry, store, kind: s.kind, sourceId: s.id, log });
    refunded += x.refunded; failed += x.failed;
  }
  return { refunded, failed };
}

/** Rotina agendada: reembolsos pendentes de qualquer pessoa + tarifas que ficaram sem registro. */
export async function sweep({ registry, store, log = console }) {
  const r = await settlePending({ registry, store, scope: null, log });
  const f = await reconcileFees({ registry, store, log });
  return { ...r, ...f };
}

export { ProviderError, DivergenceError };
