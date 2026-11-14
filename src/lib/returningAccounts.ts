import { supabase } from "@/lib/supabase";

export interface ReturningAccount {
  userId: string;
  accountType: string;
  name: string;
  emailMasked: string;
  joinedAt: string;
  houses: string[];
  priorCount: number;
  lastDeletedAt: string | null;
  refundUsed: boolean;
  priorCharges: number;
}

export interface ReturningHistory {
  identidades: { nome: string | null; tipo: string | null; casas: string[]; excluida_em: string; guardada_ate: string }[];
  cobrancas: { tipo: string; descricao: string | null; valor_cents: number; vencimento: string; status: string; paga_em: string | null }[];
  reembolsos_do_plano: { valor_cents: number; status: string; em: string }[];
  aceites: { documento: string; versao: string; em: string }[];
  chamados: { tipo: string; status: string; aberto_em: string }[];
}

export const NOTICE_TEMPLATES = [
  { key: "reembolso_usado", label: "Reembolso de 7 dias já usado", preview: "O reembolso integral de 7 dias do plano já foi utilizado em uma conta anterior vinculada a este e-mail e, por isso, não se aplica a esta conta. Se tiver dúvida, fale com o suporte." },
  { key: "registros_anteriores", label: "Registros de conta anterior", preview: "Existem registros de uma conta anterior vinculada a este e-mail. Se você acha que isso é um engano, fale com o suporte." },
  { key: "livre", label: "Aviso livre (você escreve)", preview: "" },
] as const;
export type NoticeKey = (typeof NOTICE_TEMPLATES)[number]["key"];

const friendly = (m?: string) => (m && /motivo|histórico|Modelo|aviso|observação|escreva/i.test(m) ? m : "Não foi possível concluir agora.");

export async function fetchReturningAccounts(): Promise<ReturningAccount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_returning_accounts");
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    userId: String(r.user_id),
    accountType: String(r.account_type ?? ""),
    name: String(r.display_name ?? ""),
    emailMasked: String(r.email_masked ?? ""),
    joinedAt: String(r.joined_at ?? ""),
    houses: Array.isArray(r.houses) ? (r.houses as unknown[]).map(String) : [],
    priorCount: Number(r.prior_count) || 0,
    lastDeletedAt: r.last_deleted_at ? String(r.last_deleted_at) : null,
    refundUsed: r.refund_used === true,
    priorCharges: Number(r.prior_charges) || 0,
  }));
}

export async function fetchReturningHistory(userId: string, reason: string): Promise<ReturningHistory | string> {
  if (!supabase) return "Sem conexão.";
  const { data, error } = await supabase.rpc("admin_returning_history", { p_user: userId, p_reason: reason });
  if (error) return friendly(error.message);
  return data as ReturningHistory;
}

export async function sendReturningNotice(userId: string, template: NoticeKey, note: string, reason: string): Promise<string | null> {
  if (!supabase) return "Sem conexão.";
  const { error } = await supabase.rpc("admin_notify_returning", { p_user: userId, p_template: template, p_note: note.trim() || null, p_reason: reason });
  return error ? friendly(error.message) : null;
}
