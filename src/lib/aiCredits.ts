import { supabase } from "@/lib/supabase";
import { readCredits, readPlanRefund, readRefunds, type Credits, type PackKey, type PlanRefund, type Refunds } from "@/lib/aiCreditsCore";

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

export async function fetchRefunds(): Promise<Refunds> {
  if (!supabase) return readRefunds(null);
  const { data, error } = await supabase.rpc("my_credit_refunds");
  return readRefunds(error ? null : data);
}

/** Pede o reembolso de um pacote pago há até 7 dias. Devolve { error } ou { pending } (o estorno está a caminho). */
export async function requestRefund(chargeId: string): Promise<{ error: string | null; pending?: boolean }> {
  if (!supabase) return { error: "Indisponível." };
  const { data, error } = await supabase.functions.invoke("platform-billing", { body: { action: "credit_refund", charge_id: chargeId } });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      const b = ctx ? ((await ctx.json()) as { error?: string }) : null;
      return { error: b?.error ?? "Não foi possível pedir o reembolso agora. Tente de novo." };
    } catch {
      return { error: "Não foi possível pedir o reembolso agora. Tente de novo." };
    }
  }
  return { error: null, pending: (data as { status?: string } | null)?.status === "pending" };
}

export async function fetchPlanRefund(): Promise<PlanRefund | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_plan_refund");
  return error ? null : readPlanRefund(data);
}

/** Pede o reembolso integral do primeiro pagamento do plano (até 7 dias). A assinatura é cancelada quando o estorno é aprovado. */
export async function requestPlanRefund(chargeId: string): Promise<{ error: string | null; pending?: boolean }> {
  if (!supabase) return { error: "Indisponível." };
  const { data, error } = await supabase.functions.invoke("platform-billing", { body: { action: "plan_refund", charge_id: chargeId } });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      const b = ctx ? ((await ctx.json()) as { error?: string }) : null;
      return { error: b?.error ?? "Não foi possível pedir o reembolso agora. Tente de novo." };
    } catch {
      return { error: "Não foi possível pedir o reembolso agora. Tente de novo." };
    }
  }
  return { error: null, pending: (data as { status?: string } | null)?.status === "pending" };
}
