import { supabase } from "@/lib/supabase";
import { readHousePending, type HousePendingView } from "@/lib/housePendingCore.js";

/** Central de pendências da casa (titular e equipe): o banco filtra pela casa e pela permissão de quem pergunta. */
export async function fetchHousePending(): Promise<HousePendingView | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("house_pending_center");
  if (error) return error.message || "Não foi possível carregar as pendências.";
  return readHousePending(data);
}
