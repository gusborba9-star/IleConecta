import { supabase } from "@/lib/supabase";
import { readStatus, type BillingMethod, type BillingStatus } from "@/lib/platformBillingCore";

export interface InvoiceRow { id: string; kind: string; description: string | null; amountCents: number; dueDate: string; status: string; paidAt: string | null }

/** Situação de cobrança da casa de quem está logado (o banco decide; a tela só mostra). */
export async function fetchBillingStatus(): Promise<BillingStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_house_billing_status");
  if (error) return null;
  return readStatus(data);
}

/** Últimas faturas da casa (a segurança do banco já limita à própria casa). */
export async function fetchInvoices(houseId: string, limit = 24): Promise<InvoiceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("platform_charges")
    .select("id, kind, description, amount_cents, due_date, status, paid_at")
    .eq("house_id", houseId).or("kind.neq.credit_pack,status.neq.cancelada").order("due_date", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.id), kind: String(r.kind), description: r.description ? String(r.description) : null,
    amountCents: Number(r.amount_cents), dueDate: String(r.due_date), status: String(r.status), paidAt: r.paid_at ? String(r.paid_at) : null,
  }));
}

interface Reply { url?: string; status?: string; error?: string }

/** Erros 4xx/5xx da função trazem a mensagem em português no corpo. */
async function call(body: Record<string, unknown>): Promise<Reply> {
  if (!supabase) return { error: "Indisponível." };
  const { data, error } = await supabase.functions.invoke("platform-billing", { body });
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

/** Abre a página segura de pagamento (Pix ou cartão). Devolve o erro, ou null se já redirecionou. */
export async function payCharge(chargeId: string, method: BillingMethod | null): Promise<string | null> {
  const r = await call({ action: "pay", charge_id: chargeId, method });
  if (r.error) return r.error;
  if (!r.url) return "Não foi possível abrir o pagamento.";
  window.location.assign(r.url);
  return null;
}

/** Ao voltar da página de pagamento: confere agora, sem esperar o aviso do provedor. */
export async function syncCharge(chargeId: string): Promise<string | null> {
  const r = await call({ action: "sync", charge_id: chargeId });
  return r.error ? null : (r.status ?? null);
}
