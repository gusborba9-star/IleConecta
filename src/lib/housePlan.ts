import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { DEFAULT_PLAN_MATRIX, type PlanCaps } from "@/lib/planMatrixCore";

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

/**
 * Plano da casa e o que ele inclui (limites e ferramentas da matriz central de planos, editável no painel).
 * Sem banco de dados (demonstração), tudo aparece liberado; com banco, vale o plano da casa. Enquanto carrega, caps é null.
 * O banco confere de novo toda regra: isto só decide o que a tela mostra.
 */
export function useOwnerPlan(ownerId?: string | null): { plan: HousePlan | null; caps: PlanCaps | null; loading: boolean } {
  const { config } = usePlatformConfig();
  const [state, setState] = useState<{ id: string | null; plan: HousePlan | null; done: boolean }>({ id: null, plan: null, done: false });
  useEffect(() => {
    if (!ownerId || !supabase) return;
    let alive = true;
    void fetchOwnerPlan(ownerId).then((plan) => alive && setState({ id: ownerId, plan, done: true }));
    return () => {
      alive = false;
    };
  }, [ownerId]);
  if (!supabase) return { plan: "maximo", caps: DEFAULT_PLAN_MATRIX.caps.maximo, loading: false };
  const ready = state.done && state.id === ownerId;
  const plan = ready ? state.plan : null;
  return { plan, caps: plan ? config.plan_matrix.caps[plan] : null, loading: Boolean(ownerId) && !ready };
}
