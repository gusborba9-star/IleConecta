import { supabase } from "@/lib/supabase";
import { readPlanChange, type PlanChangeStatus } from "@/lib/planChangeCore";
import type { PlanId } from "@/lib/pricing";

const clean = (e: { message?: string } | null, fallback: string) => (e?.message && !/^(fetch|network|TypeError|Failed)/i.test(e.message) ? e.message : fallback);

/** O que a casa pode fazer com o plano agora (o banco decide valores e bloqueios; a tela só mostra). */
export async function fetchPlanChange(): Promise<PlanChangeStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_plan_change_status");
  return error ? null : readPlanChange(data);
}

/** Agenda a descida de plano para a próxima renovação (sem devolução). */
export async function schedulePlanDowngrade(plan: Exclude<PlanId, "maximo">): Promise<{ error: string | null; effectiveOn: string | null }> {
  if (!supabase) return { error: "Indisponível neste modo de demonstração.", effectiveOn: null };
  const { data, error } = await supabase.rpc("my_plan_change_schedule", { p_plan: plan });
  if (error) return { error: clean(error, "Não foi possível agendar agora. Tente novamente."), effectiveOn: null };
  const on = (data as { effective_on?: unknown } | null)?.effective_on;
  return { error: null, effectiveOn: typeof on === "string" ? on : null };
}

export async function undoPlanDowngrade(): Promise<string | null> {
  if (!supabase) return "Indisponível neste modo de demonstração.";
  const { error } = await supabase.rpc("my_plan_change_undo");
  return error ? clean(error, "Não foi possível desfazer agora. Tente novamente.") : null;
}
