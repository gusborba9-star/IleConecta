import { supabase } from "@/lib/supabase";
import { LEGAL_VERSION } from "@/lib/legalCore";
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

// ---------- cartão salvo para a cobrança automática ----------
export interface CardStatus {
  available: boolean; hasHouse: boolean; hasCard: boolean; brand: string | null; last4: string | null;
  expMonth: number | null; expYear: number | null; autoEnabled: boolean; maxAttempts: number;
  lastAttempt: { attempt: number; outcome: string; at: string } | null;
}

export function readCardStatus(raw: unknown): CardStatus {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const la = r.last_attempt && typeof r.last_attempt === "object" ? (r.last_attempt as Record<string, unknown>) : null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  return {
    available: r.available === true, hasHouse: r.has_house === true, hasCard: r.has_card === true,
    brand: r.brand ? String(r.brand) : null, last4: r.last4 ? String(r.last4) : null,
    expMonth: num(r.exp_month), expYear: num(r.exp_year), autoEnabled: r.auto_enabled === true,
    maxAttempts: num(r.max_attempts) ?? 3,
    lastAttempt: la ? { attempt: Number(la.attempt), outcome: String(la.outcome), at: String(la.at ?? "") } : null,
  };
}

export async function fetchCardStatus(): Promise<CardStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_card_status");
  if (error) return null;
  return readCardStatus(data);
}

/** Abre a página segura do provedor para cadastrar o cartão (nada é cobrado). Devolve o erro, ou null se já redirecionou. */
export async function startCardSetup(): Promise<string | null> {
  const r = await call({ action: "card_setup" });
  if (r.error) return r.error;
  if (!r.url) return "Não foi possível abrir o cadastro do cartão.";
  window.location.assign(r.url);
  return null;
}

/** Volta do cadastro: confere no provedor e guarda o cartão. Devolve o erro, ou null se deu certo. */
export async function finishCardSetup(session: string): Promise<string | null> {
  const r = await call({ action: "card_sync", session });
  return r.error ?? null;
}

/** A casa marcou a autorização: o banco grava o aceite e o texto exato que ela viu. Sem isso, o servidor não abre o cadastro do cartão nem liga a cobrança. */
export async function authorizeAutoCharge(a: { planKey: string | null; amountCents: number | null; period: "mensal"; text: string }): Promise<string | null> {
  if (!supabase) return "Sem conexão com o servidor.";
  const { error } = await supabase.rpc("platform_card_authorize", { p_version: LEGAL_VERSION, p_plan: a.planKey, p_amount: a.amountCents, p_period: a.period, p_text: a.text });
  return error ? error.message : null;
}

export async function setCardAuto(enabled: boolean): Promise<string | null> {
  const r = await call({ action: "card_auto", enabled });
  return r.error ?? null;
}

export async function removeCard(): Promise<string | null> {
  const r = await call({ action: "card_remove" });
  return r.error ?? null;
}

/** Casa cancelada por reembolso: emite a fatura de reativação e abre o pagamento. Ao pagar, a casa volta sozinha. Devolve o erro, ou null se já redirecionou. */
export async function startReactivation(plan: "base" | "intermediario" | "maximo", method: "pix" | "card" | null): Promise<string | null> {
  const r = await call({ action: "reactivate", plan, method });
  if (r.error) return r.error;
  if (!r.url) return "Não foi possível abrir o pagamento.";
  window.location.assign(r.url);
  return null;
}
