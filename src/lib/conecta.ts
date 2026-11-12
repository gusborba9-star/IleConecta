import { supabase } from "@/lib/supabase";

export interface ConectaTurn { role: "user" | "assistant"; content: string }
export type ConectaAction =
  | { type: "propose_case"; kind: string; title: string; description: string }
  | { type: "go_to"; path: string }
  | { type: "risk_opened" };
export interface ConectaReply { reply: string; actions: ConectaAction[] }

/** Pergunta à Conecta. Devolve a resposta e ações já validadas pelo servidor, ou uma mensagem de erro pronta para a pessoa. */
export async function askConecta(message: string, history: ConectaTurn[]): Promise<{ ok: boolean; data?: ConectaReply; error?: string }> {
  if (!supabase) return { ok: false, error: "A assistente funciona na versão com contas reais." };
  const { data, error } = await supabase.functions.invoke("conecta", { body: { message, history: history.slice(-10) } });
  if (error) {
    try {
      const b = (await (error as { context?: Response }).context?.json()) as { message?: string } | undefined;
      if (b?.message) return { ok: false, error: b.message };
    } catch { /* corpo ilegível */ }
    return { ok: false, error: "A assistente está indisponível agora. Use o botão Relatar ocorrência." };
  }
  return { ok: true, data: data as ConectaReply };
}
