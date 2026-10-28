import { supabase } from "@/lib/supabase";

interface Reply { url?: string; error?: string; registered?: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; requirements_due?: boolean }

/** Chama a função de pagamentos. Erros 4xx/5xx trazem a mensagem em português no corpo. */
async function call(body: Record<string, unknown>): Promise<Reply> {
  if (!supabase) return { error: "Indisponível." };
  const { data, error } = await supabase.functions.invoke("payments", { body });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      const b = ctx ? ((await ctx.json()) as Reply) : null;
      return { error: b?.error ?? "Não foi possível concluir agora. Tente de novo." };
    } catch {
      return { error: "Não foi possível concluir agora. Tente de novo." };
    }
  }
  return (data ?? {}) as Reply;
}

export type CheckoutTarget = { reservationId: string } | { orderId: string } | { paymentId: string };

/** Abre o pagamento (Pix ou cartão) na página segura do Stripe. Devolve o erro, ou null se já redirecionou. */
export async function goToCheckout(target: CheckoutTarget): Promise<string | null> {
  const body: Record<string, unknown> = { action: "checkout" };
  if ("reservationId" in target) body.reservation_id = target.reservationId;
  else if ("orderId" in target) body.order_id = target.orderId;
  else body.payment_id = target.paymentId;
  const r = await call(body);
  if (r.error) return r.error;
  if (!r.url) return "Não foi possível abrir o pagamento.";
  window.location.assign(r.url);
  return null;
}

export interface AccountStatus { registered: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; requirementsDue: boolean }

export async function fetchAccountStatus(): Promise<AccountStatus | string> {
  const r = await call({ action: "status" });
  if (r.error) return r.error;
  return { registered: Boolean(r.registered), chargesEnabled: Boolean(r.charges_enabled), payoutsEnabled: Boolean(r.payouts_enabled), requirementsDue: Boolean(r.requirements_due) };
}

/** Abre o cadastro de recebimento no Stripe (cria a conta na primeira vez). */
export async function startOnboarding(): Promise<string | null> {
  const r = await call({ action: "onboard" });
  if (r.error) return r.error;
  if (!r.url) return "Não foi possível abrir o cadastro.";
  window.location.assign(r.url);
  return null;
}

/** Devolve o dinheiro de um reembolso aprovado (a função conclui o registro). */
export async function sendRefund(refundId: string): Promise<string | null> {
  const r = await call({ action: "refund", refund_id: refundId });
  return r.error ?? null;
}
