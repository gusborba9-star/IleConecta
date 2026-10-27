import { supabase } from "@/lib/supabase";

export type OrderStatus =
  | "aguardando_pagamento" | "confirmado" | "em_andamento" | "concluido" | "cancelado" | "expirado" | "reembolso_pendente" | "reembolsado";

export interface ServiceOrder {
  id: string;
  serviceId: string | null;
  title: string;
  priceCents: number;
  note: string | null;
  status: OrderStatus;
  clientId: string;
  clientName: string;
  createdAt: string;
}

export const ORDER_LABEL: Record<OrderStatus, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  confirmado: "Pedido confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  expirado: "Expirado",
  reembolso_pendente: "Reembolso em análise",
  reembolsado: "Reembolsado",
};

/** Pedido que ainda pode andar (início, conclusão ou cancelamento). */
export const isOpenOrder = (s: OrderStatus) => s === "aguardando_pagamento" || s === "confirmado" || s === "em_andamento";
export const canCancelOrder = (s: OrderStatus) => s === "aguardando_pagamento" || s === "confirmado";

const COLS = "id, service_id, title, price_cents, note, status, client_id, created_at, profiles!service_orders_client_id_fkey(display_name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toOrder = (r: Record<string, any>): ServiceOrder => ({
  id: String(r.id),
  serviceId: r.service_id ? String(r.service_id) : null,
  title: String(r.title),
  priceCents: Number(r.price_cents),
  note: r.note ?? null,
  status: r.status,
  clientId: String(r.client_id),
  clientName: r.profiles?.display_name ? String(r.profiles.display_name) : "Cliente",
  createdAt: String(r.created_at),
});

/** Pedidos desta casa que a pessoa pode ver: a dona vê todos; um cliente vê só os próprios (regra do banco). */
export async function fetchHouseOrders(ownerId: string): Promise<ServiceOrder[]> {
  if (!supabase) return [];
  const { data: h } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!h) return [];
  const { data } = await supabase.from("service_orders").select(COLS).eq("house_id", h.id).order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map(toOrder);
}

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc(fn, args);
  return error ? error.message : null;
}

/** Devolvem null em caso de sucesso, ou a mensagem de erro em português. */
export const createOrder = (serviceId: string, note: string) => call("create_service_order", { p_service: serviceId, p_note: note });
export const startOrder = (id: string) => call("start_service_order", { p_order: id });
export const finishOrder = (id: string) => call("finish_service_order", { p_order: id });
export const cancelOrder = (id: string) => call("cancel_service_order", { p_order: id });

export function subscribeOrders(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`orders-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, onChange).subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
