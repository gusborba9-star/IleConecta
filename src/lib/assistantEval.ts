import { supabase } from "@/lib/supabase";

export type EvalCheck = { name: string; ok: boolean; why: string };
export type EvalResult = { id: string; titulo: string; reply: string; handoff: boolean; results: EvalCheck[]; pass: boolean };
export type EvalReport = { total: number; passed: number; results: EvalResult[]; model?: string };

/** Modelos que dá para comparar no teste (mesma lista da função). */
export const EVAL_MODEL_OPTIONS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (atual)" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (reserva atual)" },
] as const;

/** Roda o teste automático de conversas da Assistente com o modelo de verdade (só administração). */
export async function runAssistantEval(model?: string): Promise<EvalReport | { error: string }> {
  if (!supabase) return { error: "Disponível só com conta real." };
  const { data, error } = await supabase.functions.invoke("assistant-chat", { body: { eval: true, model } });
  if (error || !data || typeof data !== "object" || !Array.isArray((data as EvalReport).results)) {
    return { error: "Não consegui rodar o teste agora. Tente de novo em instantes." };
  }
  return data as EvalReport;
}
