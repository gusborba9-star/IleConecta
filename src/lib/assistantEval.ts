import { supabase } from "@/lib/supabase";

export type EvalCheck = { name: string; ok: boolean; why: string };
export type EvalResult = { id: string; titulo: string; reply: string; handoff: boolean; results: EvalCheck[]; pass: boolean };
export type EvalReport = { total: number; passed: number; results: EvalResult[] };

/** Roda o teste automático de conversas da Assistente com o modelo de verdade (só administração). */
export async function runAssistantEval(): Promise<EvalReport | { error: string }> {
  if (!supabase) return { error: "Disponível só com conta real." };
  const { data, error } = await supabase.functions.invoke("assistant-chat", { body: { eval: true } });
  if (error || !data || typeof data !== "object" || !Array.isArray((data as EvalReport).results)) {
    return { error: "Não consegui rodar o teste agora. Tente de novo em instantes." };
  }
  return data as EvalReport;
}
