import { supabase } from "@/lib/supabase";

export { brasiliaToIso } from "@/lib/proposalsCore";

/** Estados do cartão de proposta de horário (o servidor calcula; "paga" e "concluida" vêm do pedido ligado a ela). */
export type ProposalStatus = "aberta" | "cancelada" | "expirada" | "indisponivel" | "paga" | "concluida";

export interface ProposalCardData {
  id: string;
  status: ProposalStatus;
  serviceId: string;
  serviceTitle: string;
  startsAt: string;
  when: string;
  priceCents: number;
  expiresAt: string;
  orderId: string | null;
  viewerIsHouse: boolean;
}

export interface SlotCheck {
  ok: boolean;
  message: string | null;
}

/** A casa confere o horário ANTES de enviar: ocupado por pedido, ritual, bloqueio ou data do calendário. */
export async function checkProposalSlot(serviceId: string, startsAtIso: string): Promise<SlotCheck> {
  if (!supabase) return { ok: false, message: "Indisponível." };
  const { data, error } = await supabase.rpc("check_proposal_slot", { p_service: serviceId, p_start: startsAtIso });
  if (error) return { ok: false, message: error.message };
  const r = data as { ok?: boolean; message?: string } | null;
  return { ok: r?.ok === true, message: r?.ok === true ? null : (r?.message ?? "Este horário não está livre.") };
}

export async function proposeSchedule(serviceId: string, clientId: string, startsAtIso: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("propose_schedule", { p_service: serviceId, p_client: clientId, p_start: startsAtIso });
  return error ? error.message : null;
}

export async function fetchProposalCard(id: string): Promise<ProposalCardData | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("proposal_card", { p_id: id });
  const r = data as Record<string, unknown> | null;
  if (!r) return null;
  return {
    id: String(r.id), status: r.status as ProposalStatus, serviceId: String(r.service_id), serviceTitle: String(r.service_title ?? "Serviço"),
    startsAt: String(r.starts_at), when: String(r.when ?? ""), priceCents: Number(r.price_cents ?? 0), expiresAt: String(r.expires_at),
    orderId: r.order_id ? String(r.order_id) : null, viewerIsHouse: r.mine_is_house === true,
  };
}

/** Cliente toca em "Confirmar e pagar": o servidor reserva o horário e devolve o pedido (ou avisa que o horário saiu). */
export async function acceptProposal(id: string, note: string): Promise<{ error: string | null; id: string | null }> {
  if (!supabase) return { error: "Indisponível.", id: null };
  const { data, error } = await supabase.rpc("accept_proposal", { p_id: id, p_note: note });
  if (error) return { error: error.message, id: null };
  const r = data as { ok?: boolean; order_id?: string; message?: string } | null;
  return r?.ok === true && r.order_id ? { error: null, id: String(r.order_id) } : { error: r?.message ?? "Não foi possível abrir o pagamento.", id: null };
}

export async function cancelProposal(id: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("cancel_proposal", { p_id: id });
  return error ? error.message : null;
}
