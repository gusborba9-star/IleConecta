import { supabase } from "@/lib/supabase";
import { readHouseTimeline, type HouseTimelineView } from "@/lib/houseTimelineCore.js";

/** Linha do tempo de uma casa (só administração; o banco recusa quem não é). Texto de erro sempre em português, sem detalhe técnico. */
export async function fetchHouseTimeline(houseId: string, before: string | null = null, limit = 60): Promise<HouseTimelineView | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("admin_house_timeline", { p_house: houseId, p_limit: limit, p_before: before });
  if (error) {
    if (/casa_inexistente/.test(error.message)) return "Casa não encontrada.";
    if (/not_admin|permission/i.test(error.message)) return "Só a administração vê a linha do tempo.";
    return "Não foi possível carregar a linha do tempo.";
  }
  const v = readHouseTimeline(data);
  return v.house ? v : "Não foi possível carregar a linha do tempo.";
}
