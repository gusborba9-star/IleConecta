import { supabase } from "@/lib/supabase";
import { toAuditEvent, validateAuditReason, type StaffAuditEvent } from "@/lib/staffAuditCore";

export type { StaffAuditEvent };
export { actorLabel, describeStaffEvent, validateAuditReason } from "@/lib/staffAuditCore";

type Row = Record<string, unknown>;

/** Histórico da própria equipe (o banco só entrega ao dono da casa). */
export async function fetchStaffAudit(houseId: string, limit = 50): Promise<StaffAuditEvent[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("staff_audit").select("id, house_id, action, actor_role, target_name, details, created_at")
    .eq("house_id", houseId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  return ((data as Row[] | null) ?? []).map(toAuditEvent);
}

/** Consulta da administração: exige motivo e fica registrada. Devolve os eventos ou a mensagem de erro. */
export async function adminFetchStaffAudit(houseId: string, reason: string): Promise<StaffAuditEvent[] | string> {
  const bad = validateAuditReason(reason);
  if (bad) return bad;
  if (!supabase) return "Indisponível.";
  const { data, error } = await supabase.rpc("admin_staff_audit", { p_house: houseId, p_reason: reason.trim() });
  if (error) return /Informe o motivo|Casa não encontrada|Não autorizado/.test(error.message) ? error.message : "Não foi possível consultar agora.";
  return ((data as Row[] | null) ?? []).map(toAuditEvent);
}
