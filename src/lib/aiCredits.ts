import { supabase } from "@/lib/supabase";
import { readCredits, type Credits, type PackKey } from "@/lib/aiCreditsCore";

export async function fetchCredits(): Promise<Credits | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_ai_credit_status");
  return error ? null : readCredits(data);
}

/** Abre a página segura de pagamento do pacote. Devolve o erro (em português), ou null se já redirecionou. */
export async function buyCredits(pack: PackKey): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { data, error } = await supabase.functions.invoke("platform-billing", { body: { action: "buy_credits", pack } });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      const b = ctx ? ((await ctx.json()) as { error?: string }) : null;
      return b?.error ?? "Não foi possível iniciar a compra agora. Tente de novo.";
    } catch {
      return "Não foi possível iniciar a compra agora. Tente de novo.";
    }
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) return "Não foi possível abrir o pagamento.";
  window.location.assign(url);
  return null;
}
