// Motivos aceitos depois que o ritual/trabalho começou. O reembolso só vale quando a casa não entregou o combinado.
export const REFUND_REASONS = [
  { id: "nao_realizou", label: "A casa não realizou o ritual ou trabalho" },
  { id: "nao_entregou", label: "A casa não entregou como combinado" },
  { id: "cobranca_indevida", label: "Cobrança indevida ou em duplicidade" },
  { id: "outro", label: "Outro problema com a entrega" },
];

export const MIN_DETAILS = 10;
export const MAX_DETAILS = 700;

/** Junta o motivo escolhido aos detalhes, no formato guardado no pedido. Devolve null se faltar algo. */
export function composeReason(id, details) {
  const found = REFUND_REASONS.find((r) => r.id === id);
  const text = String(details ?? "").trim();
  if (!found || text.length < MIN_DETAILS || text.length > MAX_DETAILS) return null;
  return `[${found.label}] ${text}`;
}
