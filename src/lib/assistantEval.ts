import { supabase } from "@/lib/supabase";

export type EvalCheck = { name: string; ok: boolean; why: string };
export type EvalResult = { id: string; titulo: string; reply: string; handoff: boolean; results: EvalCheck[]; pass: boolean; ms?: number; promptChars?: number };
export type EvalReport = { total: number; passed: number; results: EvalResult[]; model?: string; avgMs?: number; maxMs?: number; avgPromptChars?: number };

/** 2345 -> "2,3 s". */
export const seconds = (ms: number) => `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

/** Modelos que dá para comparar no teste (mesma lista da função). */
export const EVAL_MODEL_OPTIONS = [
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5 (atual)" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna (reserva)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (anterior)" },
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
