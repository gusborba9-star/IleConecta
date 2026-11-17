import { supabase } from "@/lib/supabase";
import { readHealth, type Health } from "@/lib/platformHealthCore.js";

/** Saúde da plataforma (só o dono). */
export async function fetchHealth(): Promise<Health | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("admin_health");
  if (error) return error.message || "Não foi possível carregar a saúde da plataforma.";
  return readHealth(data);
}

/** Roda uma rotina agendada à mão (só o dono; só as da lista segura). */
export async function runRoutine(name: string): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Disponível só com conta real." };
  const { data, error } = await supabase.rpc("admin_run_routine", { p_name: name });
  if (error) return { ok: false, message: error.message || "Não foi possível rodar a rotina." };
  const r = (data ?? {}) as { ok?: boolean; message?: string };
  return r.ok === true ? { ok: true, message: "" } : { ok: false, message: typeof r.message === "string" ? r.message.slice(0, 200) : "A rotina falhou." };
}

/** Marca um alerta como visto (não apaga). */
export async function ackAlert(code: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("admin_ack_alert", { p_code: code });
  return !error;
}
