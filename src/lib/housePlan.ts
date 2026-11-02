import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type HousePlan = "base" | "intermediario" | "maximo";

const cache = new Map<string, { plan: HousePlan; exp: number }>();

/** Plano da casa (houses.plan) pelo id do dono. A leitura é pública, como o resto da página da casa. */
export async function fetchOwnerPlan(ownerId: string): Promise<HousePlan | null> {
  if (!supabase) return null;
  const hit = cache.get(ownerId);
  if (hit && hit.exp > Date.now()) return hit.plan;
  const { data, error } = await supabase.from("houses").select("plan").eq("owner_id", ownerId).maybeSingle();
  if (error || !data) return null;
  const plan: HousePlan = data.plan === "maximo" || data.plan === "intermediario" ? data.plan : "base";
  cache.set(ownerId, { plan, exp: Date.now() + 60_000 });
  return plan;
}

/** Sem banco de dados (demonstração), tudo aparece liberado; com banco, vale o plano da casa. */
export function useOwnerPlan(ownerId?: string | null): { plan: HousePlan | null; premium: boolean; loading: boolean } {
  const [state, setState] = useState<{ id: string | null; plan: HousePlan | null; done: boolean }>({ id: null, plan: null, done: false });
  useEffect(() => {
    if (!ownerId || !supabase) return;
    let alive = true;
    void fetchOwnerPlan(ownerId).then((plan) => alive && setState({ id: ownerId, plan, done: true }));
    return () => {
      alive = false;
    };
  }, [ownerId]);
  if (!supabase) return { plan: "maximo", premium: true, loading: false };
  const ready = state.done && state.id === ownerId;
  return { plan: ready ? state.plan : null, premium: ready && state.plan === "maximo", loading: Boolean(ownerId) && !ready };
}
