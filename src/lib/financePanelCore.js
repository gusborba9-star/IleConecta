// Apresentação do painel financeiro da administração (a conta é feita no banco, em centavos inteiros).

export const ANOMALY_LABELS = {
  confirmado_sem_lancamentos: "Confirmado sem lançamentos no livro-razão",
  lancamentos_nao_fecham: "Lançamentos não fecham com o pagamento",
  comissao_ausente: "Comissão não registrada",
  estorno_nao_zerou: "Estorno não zerou o livro-razão",
  lancamentos_sem_cobranca: "Lançamentos em cobrança não confirmada",
  comissao_diverge_da_regra: "Comissão diferente da regra da época",
  regra_ausente: "Regra de comissão inexistente",
  contestado: "Pagamento contestado",
  tarifa_do_provedor_pendente: "Tarifa do provedor ainda desconhecida",
  tarifa_diverge_do_livro: "Tarifa do provedor diverge do livro-razão",
  confirmado_sem_data: "Confirmado sem data de confirmação",
  pendente_antigo: "Pendente há mais de 24 horas",
  reembolso_parado: "Pedido de reembolso parado",
  reembolso_sem_estorno: "Reembolso concluído sem estorno",
};

export const SEVERITY_LABELS = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const KIND_LABELS = { ritual: "Rituais", servico: "Serviços", mensalidade: "Mensalidades" };

/** Centavos inteiros → "R$ 1.234,56" sem passar por ponto flutuante na parte inteira. */
export function formatCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  const neg = n < 0;
  const abs = Math.abs(Math.trunc(n));
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

export function kindLabel(kind) {
  return Object.hasOwn(KIND_LABELS, kind) ? KIND_LABELS[kind] : String(kind);
}

export function anomalyLabel(code) {
  return Object.hasOwn(ANOMALY_LABELS, code) ? ANOMALY_LABELS[code] : "Divergência";
}

export function severityTone(sev) {
  return sev === "alta" ? "danger" : sev === "media" ? "gold" : "muted";
}

/** Resposta do banco → formato seguro para a tela (ignora o que não for do tipo esperado). */
export function readSummary(raw) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const t = raw && typeof raw === "object" && raw.totals && typeof raw.totals === "object" ? raw.totals : {};
  const rf = raw && typeof raw === "object" && raw.refunds && typeof raw.refunds === "object" ? raw.refunds : {};
  return {
    days: num(raw?.days),
    feeRuleVersion: typeof raw?.fee_rule_version === "string" ? raw.fee_rule_version : "",
    payments: num(t.payments),
    confirmedN: num(t.confirmed_n),
    confirmedGross: num(t.confirmed_gross_cents),
    platformFee: num(t.platform_fee_cents),
    processorFeeKnown: num(t.processor_fee_known_cents),
    processorFeePendingN: num(t.processor_fee_pending_n),
    refundedN: num(t.refunded_n),
    refundedGross: num(t.refunded_gross_cents),
    failedN: num(t.failed_n),
    pendingN: num(t.pending_n),
    contestedN: num(t.contested_n),
    byKind: (Array.isArray(raw?.by_kind) ? raw.by_kind : [])
      .filter((x) => x && typeof x.kind === "string")
      .map((x) => ({ kind: x.kind, n: num(x.n), gross: num(x.gross_cents), fee: num(x.platform_fee_cents) })),
    refundsOpenN: num(rf.open_n),
    refundsOpenOldestDays: num(rf.open_oldest_days),
    refundsCompletedN: num(rf.completed_n),
  };
}

export function readAnomalies(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : []).filter((i) => i && typeof i.code === "string");
  return {
    total: Number.isFinite(Number(raw?.total)) ? Number(raw.total) : items.length,
    shown: items.length,
    scope: typeof raw?.scope === "string" ? raw.scope : "",
    items: items.map((i) => ({
      code: i.code,
      severity: Object.hasOwn(SEVERITY_LABELS, i.severity) ? i.severity : "baixa",
      paymentId: typeof i.payment_id === "string" ? i.payment_id : "",
      detail: typeof i.detail === "string" ? i.detail : "",
      amount: Number.isFinite(Number(i.amount_cents)) ? Number(i.amount_cents) : 0,
      at: typeof i.at === "string" ? i.at : "",
    })),
  };
}
