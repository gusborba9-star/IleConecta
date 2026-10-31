import { supabase } from "@/lib/supabase";

export interface FollowSummary {
  /** Seguidores por casa (chave = id do dono da casa). */
  counts: Record<string, number>;
  /** Casas que a pessoa logada segue. */
  mine: string[];
}

const EMPTY: FollowSummary = { counts: {}, mine: [] };

export async function fetchFollowSummary(): Promise<FollowSummary> {
  if (!supabase) return EMPTY;
  const { data, error } = await supabase.rpc("house_follow_summary");
  if (error || !data) return EMPTY;
  const d = data as { counts?: Record<string, number>; mine?: string[] };
  return { counts: d.counts ?? {}, mine: Array.isArray(d.mine) ? d.mine : [] };
}

/** Retorna null se deu certo, ou a mensagem de erro. */
export async function setFollowing(houseOwnerId: string, follow: boolean): Promise<string | null> {
  if (!supabase) return "Seguir só funciona com conta real.";
  const { error } = await supabase.rpc(follow ? "follow_house" : "unfollow_house", { p_owner: houseOwnerId });
  return error ? error.message || "Não foi possível concluir. Tente de novo." : null;
}
