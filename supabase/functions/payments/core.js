// Núcleo financeiro: fluxos de cobrança, aviso, reembolso e conciliação de tarifa.
// Não conhece Stripe nem Supabase: fala com o provedor REGISTRADO na transação (registry) e com o banco por "portas" (store).
// Pode ser testado em Node com um provedor e um banco falsos.
import { CheckoutStateError, DivergenceError, ProviderError, assertSameTransaction } from "./provider.js";

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

  let lease;
  try {
    lease = await store.acquireEvent({ id: event.id, type: event.type, account: event.account ?? null, payload: event });
  } catch (e) {
    log.error("acquire_failed", event.id, msg(e));
    return { status: 500, body: { error: "Falha ao registrar o aviso." } };
  }
  if (lease.outcome === "done") return { status: 200, body: { received: true, duplicate: true } };
  if (lease.outcome !== "acquired" || !lease.token) return { status: 409, body: { error: "Aviso em processamento." } };

  // Só o dono da trava (token desta aquisição) conclui, rejeita ou libera. Um worker cuja lease venceu não mexe no evento de outro.
  const finish = async (outcome, error) => {
    try {
      const owned = await store.finishEvent(event.id, lease.token, outcome, error);
      if (!owned) log.error("lease_lost", event.id, outcome);
      return owned;
    } catch (e) {
      log.error("finish_failed", event.id, msg(e));
      return null; // falha de persistência
    }
  };

  try {
    await handleEvent({ registry, store, adapter, event, log });
  } catch (e) {
    if (e instanceof DivergenceError) {
      log.error("event_rejected", event.id, msg(e));
      await finish("rejected", msg(e));
      return { status: 200, body: { received: true, rejected: true } };
    }
    await finish("retry", msg(e));
    return { status: 500, body: { error: "Falha ao processar." } };
  }
  // Os efeitos financeiros são idempotentes; se não for mais o dono, o worker atual é quem conclui (o provedor reenvia).
  const done = await finish("done", null);
  if (done === true) return { status: 200, body: { received: true } };
  return { status: done === false ? 409 : 500, body: { error: done === false ? "Aviso assumido por outro processo." : "Falha ao concluir o aviso." } };
}

async function handleEvent({ registry, store, adapter, event, log }) {
  const ev = adapter.parseEvent(event);
  if (ev.kind === "paid_candidate") {
    if (!ev.paid) return; // Pix ainda aguardando: vem outro aviso quando pagar
    const pay = await findPayment(store, adapter.id, ev);
    // Cobrança PAGA sem pagamento correspondente: nunca ignorar em silêncio. O evento é fechado como rejeitado (visível em
    // payments_provider_anomalies) para investigação; não há o que reenviar, e nenhum valor é lançado ou devolvido sozinho.
    if (!pay) throw new DivergenceError(`Cobrança paga sem pagamento correspondente (ref=${ev.ref || "?"}, pagamento=${ev.paymentId ?? "?"}).`);
    try {
      assertSameTransaction(pay, { provider: adapter.id, ref: ev.ref, account: ev.account });
    } catch (e) {
      if (e instanceof DivergenceError) throw new DivergenceError(`${e.message} (ref do aviso=${ev.ref || "?"}, pagamento=${pay.id}, ref registrada=${pay.provider_ref ?? "?"})`);
      throw e;
    }
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
  await linkReferences({ registry, store, pay, log });
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

// ---------- vínculo Checkout ↔ PaymentIntent ↔ Charge ----------
/**
 * Registra o PaymentIntent e a Charge do pagamento confirmado. Melhor esforço: nunca derruba a confirmação financeira;
 * o que falhar fica para a rotina. Um conflito (outra Charge já registrada) ou referência duplicada em outro pagamento é
 * sinal de cobrança em dobro e fica no log para investigação — nada é sobrescrito.
 */
export async function linkReferences({ registry, store, pay, log = console }) {
  try {
    if (!pay.provider_ref || !pay.stripe_account_id) return false;
    const refs = await registry.forPayment(pay).fetchReferences({ ref: pay.provider_ref, account: pay.stripe_account_id });
    if (!refs) return false;
    const res = await store.recordReferences(pay, refs);
    if (res === "conflito" || res === "duplicada") log.error("provider_ref_conflict", pay.id, res, refs.paymentRef, refs.chargeRef);
    return res === "registrada" || res === "ja_registrada";
  } catch (e) {
    log.error("link_references_failed", pay.id, msg(e));
    return false;
  }
}

/** Rotina: confirmados/estornados ainda sem PaymentIntent/Charge registrados. */
export async function linkMissingReferences({ registry, store, limit = 25, log = console }) {
  const list = await store.paymentsMissingRefs(limit);
  let done = 0, failed = 0;
  for (const pay of list) (await linkReferences({ registry, store, pay, log })) ? done++ : failed++;
  return { refs_done: done, refs_failed: failed };
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
    // Erros de consulta (rede, autenticação, indisponibilidade) PROPAGAM: sem evidência não se abre outra cobrança.
    const s = await registry.forPayment(pay).getCheckout({ ref: pay.provider_ref, account });
    if (s.status === "open" && s.url) return { url: s.url };
    if (s.status !== "expired") {
      if (s.status === "complete") throw new CheckoutStateError(s.paid ? "Este pagamento já foi realizado; aguarde a confirmação." : "O pagamento está em processamento; aguarde a confirmação.");
      throw new CheckoutStateError("Não foi possível confirmar o estado da cobrança anterior.");
    }
    // Evidência: o provedor informa que a sessão anterior expirou — só então cria outra.
  }
  const adapter = registry.forNew(providerId);
  const created = await adapter.createCheckout({
    payment: pay, title, appUrl, clientEmail: email, account, expiresAt, idempotencyKey: `cs_${pay.id}_${pay.provider_ref ?? "0"}_${expiresAt}`,
  });
  const attached = await store.attachCheckout(pay, { provider: adapter.id, ref: created.ref, account });
  if (attached === false) {
    // A transação mudou entre a leitura e a gravação. Mesma sessão (chave de idempotência igual) = abertura concorrente benigna.
    const cur = await store.paymentById(pay.id);
    if (cur?.provider_ref === created.ref) return { url: created.url };
    // Outra sessão ficou registrada (ou o pagamento deixou de estar pendente): esta sessão nova NÃO é gravada. Fica sem vínculo,
    // mas não paga nada por si; expira sozinha. O registro abaixo permite localizar a sessão órfã.
    log.error("checkout_orphan_session", pay.id, created.ref, cur?.provider_ref ?? null, cur?.status ?? null);
    throw new CheckoutStateError("Outra cobrança já foi aberta para este pagamento. Atualize a página e tente novamente.");
  }
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

/**
 * Conclui os reembolsos de cancelamento pendentes. `scope` limita a uma pessoa (null = todos).
 * @param {{ registry: any, store: any, scope?: string | null, log?: any }} args
 */
export async function settlePending({ registry, store, scope = null, log = console }) {
  const sources = await store.pendingSources(scope, 50);
  let refunded = 0, failed = 0;
  for (const s of sources) {
    const x = await settleSource({ registry, store, kind: s.kind, sourceId: s.id, log });
    refunded += x.refunded; failed += x.failed;
  }
  return { refunded, failed };
}

/** Rotina agendada: reembolsos pendentes de qualquer pessoa + tarifas e vínculos que ficaram sem registro. */
export async function sweep({ registry, store, log = console }) {
  const r = await settlePending({ registry, store, scope: null, log });
  const f = await reconcileFees({ registry, store, log });
  const k = await linkMissingReferences({ registry, store, log });
  return { ...r, ...f, ...k };
}

export { ProviderError, DivergenceError, CheckoutStateError };
