import { supabase } from "@/lib/supabase";
import { readPending, type PendingView } from "@/lib/pendingCenterCore.js";

/** Central de pendências (só administração): lê as tabelas originais na hora; não guarda cópia. */
export async function fetchPendingCenter(): Promise<PendingView | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("admin_pending_center");
  if (error) return error.message || "Não foi possível carregar as pendências.";
  return readPending(data);
}
