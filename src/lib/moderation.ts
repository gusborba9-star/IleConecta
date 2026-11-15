import { supabase } from "@/lib/supabase";

export interface ModerationRow {
  id: string; house_id: string; house_name: string; target_table: "services" | "events" | "posts"; target_id: string;
  reason: "promessa" | "contato_antigo"; excerpt: string;
  status: "pendente" | "orientada" | "advertida" | "ocultada" | "contestada" | "encerrada";
  outcome: string | null; created_at: string; orientation_at: string | null; warned_at: string | null; deadline_at: string | null;
  hidden_at: string | null; contested_at: string | null; contest_text: string | null; contest_decision: string | null;
  admin_note: string | null; adaptation_start: string | null; adaptation_days: number;
}
export interface MyModerationRow extends Omit<ModerationRow, "house_id" | "house_name" | "target_id" | "outcome" | "adaptation_start" | "adaptation_days"> {
  house_name: string; contest_until: string | null;
}

const fail = (e: { message?: string } | null, fallback: string) => new Error(e?.message && !/^(Failed|TypeError)/.test(e.message) ? e.message : fallback);

export async function adminModerationList(status?: string): Promise<ModerationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_moderation_list", { p_status: status ?? null });
  if (error) throw fail(error, "Não foi possível carregar a fila.");
  return (data as ModerationRow[]) ?? [];
}
export async function adminModerationAct(id: string, action: string, note?: string): Promise<string> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("admin_moderation_act", { p_flag: id, p_action: action, p_note: note?.trim() || null });
  if (error) throw fail(error, "Não foi possível concluir a ação.");
  return String(data);
}
export async function adminModerationStartAdaptation(): Promise<string> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("admin_moderation_start_adaptation");
  if (error) throw fail(error, "Não foi possível iniciar o período.");
  return String(data);
}
export async function adminModerationScan(): Promise<number> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("admin_moderation_scan");
  if (error) throw fail(error, "Não foi possível varrer o conteúdo.");
  return Number(data ?? 0);
}
export async function myModerationFlags(): Promise<MyModerationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_moderation_flags");
  if (error) throw fail(error, "Não foi possível carregar os avisos.");
  return (data as MyModerationRow[]) ?? [];
}
export async function contestModeration(id: string, text: string): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("contest_moderation_flag", { p_flag: id, p_text: text });
  if (error) throw fail(error, "Não foi possível enviar a contestação.");
}
