// Portas do núcleo financeiro implementadas sobre o Supabase (cliente com a chave de serviço, injetado).
// Toda decisão de integridade (identidade da transação, trava do evento, tarifa idempotente) está nas funções SQL da migração 0064;
// aqui só se chamam essas funções.
import { DivergenceError } from "./provider.js";

export const PAYMENT_COLS = "id, provider, provider_ref, stripe_account_id, identity_strict, status, gross_cents, fee_cents, reservation_id, order_id, member_due_id, stage_no";
const LEASE_SECONDS = 120;

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export function createStore(admin) {
  return {
    // ----- eventos (trava atômica) -----
    /** { outcome: "acquired" | "done" | "busy", token } — o token identifica o dono da trava. */
    async acquireEvent({ id, type, account, payload }) {
      const rows = must(await admin.rpc("acquire_stripe_event", { p_id: id, p_type: type ?? "", p_account: account, p_payload: payload, p_lease_seconds: LEASE_SECONDS }), "acquire_event");
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { outcome: row?.outcome ?? "busy", token: row?.lease_token ?? null };
    },
    /** true só se este worker ainda é o dono da trava; false = a lease venceu e outro assumiu (nada foi alterado). */
    async finishEvent(id, token, outcome, error) {
      return must(await admin.rpc("finish_stripe_event", { p_id: id, p_token: token, p_outcome: outcome, p_error: error ?? null }), "finish_event") === true;
    },

    // ----- transações -----
    async paymentById(id) {
      return must(await admin.from("payments").select(PAYMENT_COLS).eq("id", id).maybeSingle(), "payment_by_id");
    },
    async paymentByRef(provider, ref) {
      return must(await admin.from("payments").select(PAYMENT_COLS).eq("provider", provider).eq("provider_ref", ref).maybeSingle(), "payment_by_ref");
    },
    /** Confirmação financeira atômica; o banco confere provedor, referência e conta antes de qualquer lançamento. */
    async confirm(pay) {
      const res = must(await admin.rpc("confirm_payment_for", {
        p_payment: pay.id, p_provider: pay.provider, p_provider_ref: pay.provider_ref, p_account: pay.stripe_account_id,
      }), "confirm_payment");
      if (res === "divergente") throw new DivergenceError("O banco recusou a confirmação: identidade da transação divergente.");
      return res;
    },
    async failPending(pay) {
      must(await admin.from("payments").update({ status: "falhou" }).eq("id", pay.id).eq("provider", pay.provider).eq("status", "pendente"), "fail_pending");
    },
    /** Grava a cobrança aberta; só enquanto pendente, no mesmo provedor. O gatilho do banco impede trocar provedor/conta. */
    async attachCheckout(pay, { provider, ref, account }) {
      const rows = must(await admin.from("payments")
        .update({ provider_ref: ref, stripe_account_id: account, payment_method: null })
        .eq("id", pay.id).eq("provider", provider).eq("status", "pendente").select("id"), "attach_checkout");
      if (!rows?.length) throw new Error("Não foi possível abrir o pagamento.");
    },

    // ----- tarifa do processador (separada da confirmação) -----
    async recordFee(pay, { feeCents, method }) {
      const res = must(await admin.rpc("record_processor_fee_for", {
        p_payment: pay.id, p_provider: pay.provider, p_provider_ref: pay.provider_ref, p_account: pay.stripe_account_id,
        p_fee_cents: feeCents, p_method: method ?? null,
      }), "record_fee");
      if (res === "divergente") throw new DivergenceError("O banco recusou a tarifa: identidade da transação divergente.");
      return res;
    },
    async paymentsMissingFee(limit) {
      return must(await admin.rpc("payments_missing_processor_fee", { p_limit: limit }), "missing_fee") ?? [];
    },

    // ----- reembolso -----
    async approvedRefundRequest(paymentId) {
      return must(await admin.from("refund_requests").select("id, payment_id").eq("payment_id", paymentId).eq("status", "aprovado").maybeSingle(), "approved_refund");
    },
    async completeRefund(id) {
      must(await admin.rpc("complete_refund", { p_id: id }), "complete_refund");
    },
    async completeCancelRefund(paymentId) {
      must(await admin.rpc("complete_cancel_refund", { p_payment: paymentId }), "complete_cancel_refund");
    },
    async confirmedPaymentsOf(kind, sourceId) {
      const col = kind === "reserva" ? "reservation_id" : "order_id";
      return must(await admin.from("payments").select(PAYMENT_COLS).eq(col, sourceId).eq("status", "confirmado").order("stage_no"), "confirmed_of") ?? [];
    },
    /** Reservas/pedidos em "reembolso_pendente" (de uma pessoa, ou de todas quando scope é null). */
    async pendingSources(scope, limit) {
      let rq = admin.from("reservations").select("id").eq("status", "reembolso_pendente").limit(limit);
      let oq = admin.from("service_orders").select("id").eq("status", "reembolso_pendente").limit(limit);
      if (scope) { rq = rq.eq("user_id", scope); oq = oq.eq("client_id", scope); }
      const [rs, os] = await Promise.all([rq, oq]);
      return [
        ...(must(rs, "pending_reservations") ?? []).map((r) => ({ kind: "reserva", id: r.id })),
        ...(must(os, "pending_orders") ?? []).map((o) => ({ kind: "pedido", id: o.id })),
      ];
    },
  };
}
