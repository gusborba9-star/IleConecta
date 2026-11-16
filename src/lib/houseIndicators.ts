import { supabase } from "@/lib/supabase";
import { readHouseIndicators, type HouseIndicatorsView } from "@/lib/houseIndicatorsCore.js";

const MSG: Record<string, string> = {
  sem_permissao: "Você não tem permissão para ver os indicadores.",
  not_house: "Disponível só para casas e suas equipes.",
};
/** Indicadores da casa no período (7, 30 ou 90 dias); o banco filtra pela casa e pela permissão de quem pergunta. */
export async function fetchHouseIndicators(days: number): Promise<HouseIndicatorsView | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("house_indicators", { p_days: days });
  if (error) return Object.entries(MSG).find(([k]) => (error.message ?? "").includes(k))?.[1] ?? "Não foi possível carregar os indicadores.";
  return readHouseIndicators(data);
}
