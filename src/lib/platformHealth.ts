import { supabase } from "@/lib/supabase";
import { readHealth, type Health } from "@/lib/platformHealthCore.js";

/** Saúde da plataforma (só o dono). */
export async function fetchHealth(): Promise<Health | string> {
  if (!supabase) return "Disponível só com conta real.";
  const { data, error } = await supabase.rpc("admin_health");
  if (error) return error.message || "Não foi possível carregar a saúde da plataforma.";
  return readHealth(data);
}
