import { supabase } from "@/lib/supabase";
import { readMaintenance, type Maintenance } from "@/lib/maintenanceCore.js";

const OFF: Maintenance = { assistant: false, payments: false, message: null, since: null, any: false };

/** Lê o interruptor de emergência (leitura pública). Qualquer falha = nada em manutenção. */
export async function fetchMaintenance(): Promise<Maintenance> {
  if (!supabase) return OFF;
  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", "maintenance").maybeSingle();
  return error ? OFF : readMaintenance(data?.value);
}

/** Liga/desliga as chaves (só o dono; o banco confere). Devolve o erro em português ou null. */
export async function saveMaintenance(assistant: boolean, payments: boolean, message: string): Promise<string | null> {
  if (!supabase) return "Disponível só com conta real.";
  const { error } = await supabase.rpc("admin_set_maintenance", { p_assistant: assistant, p_payments: payments, p_message: message.trim() || null });
  return error ? error.message || "Não foi possível salvar." : null;
}
