import { supabase } from "@/lib/supabase";

export type RefundStatus = "pendente" | "aprovado" | "recusado" | "reembolsado" | "cancelado";

export interface RefundRequest {
  id: string;
  reservationId: string | null;
  orderId: string | null;
  kind: "antes_do_inicio" | "apos_inicio";
  reason: string | null;
  amountCents: number;
  status: RefundStatus;
  decisionNote: string | null;
  createdAt: string;
  clientName: string;
  houseName: string;
}

export const REFUND_LABEL: Record<RefundStatus, string> = {
  pendente: "Reembolso em análise",
  aprovado: "Reembolso aprovado",
  recusado: "Reembolso não aprovado",
  reembolsado: "Reembolsado",
  cancelado: "Pedido retirado",
};

/** Pedido ainda em andamento (impede abrir outro para o mesmo pagamento). */
export const isOpenRefund = (s: RefundStatus) => s === "pendente" || s === "aprovado";

const COLS =
  "id, reservation_id, order_id, kind, reason, amount_cents, status, decision_note, created_at, profiles!refund_requests_client_id_fkey(display_name), houses(name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRefund = (r: Record<string, any>): RefundRequest => ({
  id: String(r.id),
  reservationId: r.reservation_id ? String(r.reservation_id) : null,
  orderId: r.order_id ? String(r.order_id) : null,
  kind: r.kind,
  reason: r.reason ?? null,
  amountCents: Number(r.amount_cents),
  status: r.status,
  decisionNote: r.decision_note ?? null,
  createdAt: String(r.created_at),
  clientName: r.profiles?.display_name ? String(r.profiles.display_name) : "Cliente",
  houseName: r.houses?.name ? String(r.houses.name) : "Casa",
});

/** Os pedidos de reembolso que a pessoa pode ver (a regra do banco limita ao cliente, à casa dona e à administração). */
export async function fetchMyRefunds(userId: string): Promise<RefundRequest[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("refund_requests").select(COLS).eq("client_id", userId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map(toRefund);
}

/** Ids de reservas e pedidos com pagamento confirmado (só entram aqui os da própria pessoa, pela regra do banco). */
export async function fetchMyPaidSources(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase) return out;
  const { data } = await supabase.from("payments").select("reservation_id, order_id").eq("status", "confirmado").limit(500);
  for (const p of data ?? []) {
    if (p.reservation_id) out.add(String(p.reservation_id));
    if (p.order_id) out.add(String(p.order_id));
  }
  return out;
}

/** Fila da administração: pedidos pendentes primeiro, depois os aprovados aguardando estorno. */
export async function fetchRefundQueue(): Promise<RefundRequest[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("refund_requests").select(COLS).in("status", ["pendente", "aprovado"]).order("created_at", { ascending: true }).limit(200);
  return (data ?? []).map(toRefund);
}

/** Histórico da administração: reembolsos já devolvidos (inclui os automáticos de cancelamento) e pedidos recusados. */
export async function fetchRefundHistory(): Promise<RefundRequest[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("refund_requests").select(COLS).in("status", ["reembolsado", "recusado"]).order("created_at", { ascending: false }).limit(30);
  return (data ?? []).map(toRefund);
}

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc(fn, args);
  return error ? error.message : null;
}

/** Devolvem null em caso de sucesso, ou a mensagem de erro em português. */
export const requestRefund = (kind: "reserva" | "pedido", sourceId: string, reason: string) =>
  call("request_refund", { p_kind: kind, p_source: sourceId, p_reason: reason });
export const withdrawRefund = (id: string) => call("withdraw_refund_request", { p_id: id });
export const decideRefund = (id: string, approve: boolean, note: string) => call("decide_refund", { p_id: id, p_approve: approve, p_note: note });
export const completeRefund = (id: string) => call("complete_refund", { p_id: id });

export function subscribeRefunds(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`refunds-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "refund_requests" }, onChange).subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
