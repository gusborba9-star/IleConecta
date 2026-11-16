import { supabase } from "@/lib/supabase";
import { readAdminIndicators, type AdminIndicatorsView } from "@/lib/adminIndicatorsCore.js";

/** Indicadores centrais da plataforma no período (7, 30 ou 90 dias); o banco só responde para a administração. */
export async function fetchAdminIndicators(days: number): Promise<AdminIndicatorsView | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("admin_indicators", { p_days: days });
  if (error) return /not_admin/.test(error.message ?? "") ? "Disponível só para a administração." : "Não foi possível carregar os indicadores.";
  return readAdminIndicators(data);
}
