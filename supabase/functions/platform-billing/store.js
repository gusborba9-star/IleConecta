// Porta do banco da Cobrança da Plataforma (Supabase, chave de serviço). Toda mudança financeira passa por funções do banco
// (atômicas e idempotentes); aqui só há leituras e chamadas a essas funções.
const COLS = "id, house_id, kind, item_key, description, amount_cents, due_date, status, provider, provider_ref, provider_method, paid_ref, processor_fee_cents";

export function createStore(admin) {
  const rpc = async (name, args) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    config: () => rpc("platform_billing_config", {}),
    async chargeById(id) {
      const { data, error } = await admin.from("platform_charges").select(COLS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async houseOwner(houseId) {
      const { data, error } = await admin.from("houses").select("owner_id").eq("id", houseId).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.owner_id ?? null;
    },
    async refCount(chargeId) {
      const { count, error } = await admin.from("platform_charge_refs").select("id", { count: "exact", head: true }).eq("charge_id", chargeId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    attach: (chargeId, provider, ref, method, url) => rpc("platform_charge_attach", { p_charge: chargeId, p_provider: provider, p_ref: ref, p_method: method, p_url: url }),
    chargeIdByRef: (provider, ref) => rpc("platform_charge_of_ref", { p_provider: provider, p_ref: ref }),
    progress: (provider, ref, state) => rpc("platform_charge_progress", { p_provider: provider, p_ref: ref, p_state: state }),
    confirm: (provider, ref, paidCents, feeCents) => rpc("platform_charge_confirm", { p_provider: provider, p_ref: ref, p_paid_cents: paidCents, p_fee_cents: feeCents }),
    recordFee: (provider, ref, fee) => rpc("platform_charge_record_fee", { p_provider: provider, p_ref: ref, p_fee_cents: fee }),
    tick: () => rpc("platform_billing_tick", {}),
    refundBegin: (houseId, chargeId, by) => rpc("platform_credit_refund_begin", { p_house: houseId, p_charge: chargeId, p_by: by }),
    refundDone: (refundId, ref) => rpc("platform_credit_refund_done", { p_refund: refundId, p_refund_ref: ref }),
    refundFail: (refundId, error) => rpc("platform_credit_refund_fail", { p_refund: refundId, p_error: error }),
    refundsPending: () => rpc("platform_credit_refunds_pending", {}),
    reactivationIssue: (houseId) => rpc("platform_reactivation_issue", { p_house: houseId }),
    planRefundBegin: (houseId, chargeId, by) => rpc("platform_plan_refund_begin", { p_house: houseId, p_charge: chargeId, p_by: by }),
    planRefundDone: (refundId, ref) => rpc("platform_plan_refund_done", { p_refund: refundId, p_refund_ref: ref }),
    planRefundFail: (refundId, error) => rpc("platform_plan_refund_fail", { p_refund: refundId, p_error: error }),
    planRefundsPending: () => rpc("platform_plan_refunds_pending", {}),
    autoEnabled: () => rpc("billing_auto_card_enabled", {}),
    autoDue: (nowIso) => rpc("platform_autocharge_due", { p_now: nowIso }),
    autoBegin: (chargeId, attempt, nowIso) => rpc("platform_auto_attempt_begin", { p_charge: chargeId, p_attempt: attempt, p_now: nowIso }),
    autoResult: (chargeId, attempt, outcome, ref, code) => rpc("platform_auto_attempt_result", { p_charge: chargeId, p_attempt: attempt, p_outcome: outcome, p_ref: ref, p_code: code }),
    cardCustomer: (houseId, provider, customer) => rpc("platform_card_customer", { p_house: houseId, p_provider: provider, p_customer: customer }),
    cardSetupOpen: (houseId, provider, ref) => rpc("platform_card_setup_open", { p_house: houseId, p_provider: provider, p_ref: ref }),
    cardSave: (houseId, provider, setupRef, customer, m) => rpc("platform_card_save", { p_house: houseId, p_provider: provider, p_setup_ref: setupRef, p_customer: customer, p_method: m.id, p_brand: m.brand, p_last4: m.last4, p_month: m.expMonth, p_year: m.expYear }),
    cardSetAuto: (houseId, enabled) => rpc("platform_card_set_auto", { p_house: houseId, p_enabled: enabled }),
    cardRemove: (houseId) => rpc("platform_card_remove", { p_house: houseId }),
    cardAuthOk: (houseId) => rpc("platform_card_auth_ok", { p_house: houseId, p_minutes: 60 }),
    cardGet: (houseId) => rpc("platform_card_get", { p_house: houseId }),
    async houseOfOwner(userId) {
      const { data, error } = await admin.from("houses").select("id").eq("owner_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },
    async eventSeen(provider, eventId) {
      const { data, error } = await admin.from("platform_billing_events").select("id").eq("provider", provider).eq("event_id", eventId).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async logEvent(row) {
      const { error } = await admin.from("platform_billing_events").upsert(row, { onConflict: "provider,event_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    /**
     * Faturas com página de pagamento ainda sem desfecho: a rotina confere no provedor (rede de segurança do aviso).
     * Em análise: sempre. Abertas/vencidas: só as de página recente (a página expira em horas; conferir as antigas seria gasto à toa
     * e, ordenando pelas mais velhas, deixaria as novas sem conferir).
     */
    async openWithRef(limit) {
      const since = new Date(Date.now() - 2 * 86400000).toISOString();
      const proc = await admin.from("platform_charges").select(COLS).eq("status", "em_processamento").not("provider_ref", "is", null).order("updated_at", { ascending: true }).limit(limit);
      if (proc.error) throw new Error(proc.error.message);
      const recent = await admin.from("platform_charges").select(COLS).in("status", ["aberta", "vencida"]).not("provider_ref", "is", null).gte("updated_at", since).order("updated_at", { ascending: false }).limit(limit);
      if (recent.error) throw new Error(recent.error.message);
      return [...(proc.data ?? []), ...(recent.data ?? [])].slice(0, limit);
    },
    async paidWithoutFee(limit) {
      const { data, error } = await admin.from("platform_charges").select(COLS).eq("status", "paga").is("processor_fee_cents", null).not("paid_ref", "is", null).order("paid_at", { ascending: true }).limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
