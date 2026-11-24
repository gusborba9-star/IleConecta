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
  { key: "reembolso_ja_usado", label: "Reembolso de 7 dias já utilizado", preview: "Aviso do sistema: este endereço de e-mail possui histórico vinculado a uma conta encerrada anteriormente, na qual o reembolso de 7 dias do plano já foi utilizado; por isso ele não é concedido novamente. Se tiver dúvidas, consulte os Termos de Uso ou fale com o suporte." },
  { key: "registros_anteriores", label: "Histórico de conta anterior", preview: "Aviso do sistema: este endereço de e-mail possui histórico vinculado a uma conta encerrada anteriormente na plataforma. Caso tenha dúvidas sobre as regras vigentes de contratação ou benefícios, consulte nossos Termos de Uso ou fale com o suporte." },
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

export interface SharedEmailOther {
  nome: string;
  situacao: "ativa" | "excluída";
  desde: string | null;
  reembolsoUsado: boolean;
}
export interface SharedEmailAccount {
  userId: string;
  accountType: string;
  name: string;
  emailMasked: string;
  joinedAt: string;
  others: SharedEmailOther[];
  refundUsed: boolean;
}

/** Contas ativas cujo e-mail (atual ou anterior) também esteve vinculado a outra conta. */
export async function fetchSharedEmailAccounts(): Promise<SharedEmailAccount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_shared_email_accounts");
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    userId: String(r.user_id),
    accountType: String(r.account_type ?? ""),
    name: String(r.display_name ?? ""),
    emailMasked: String(r.email_masked ?? ""),
    joinedAt: String(r.joined_at ?? ""),
    refundUsed: r.refund_used === true,
    others: (Array.isArray(r.others) ? (r.others as Record<string, unknown>[]) : []).map((o) => ({
      nome: String(o.nome ?? ""),
      situacao: o.situacao === "ativa" ? "ativa" : "excluída",
      desde: o.desde ? String(o.desde) : null,
      reembolsoUsado: o.reembolso_usado === true,
    })),
  }));
}

export interface SamePersonOther {
  nome: string;
  tipo: string;
  desde: string | null;
  sinais: ("aparelho" | "rede")[];
  nivel: "forte" | "fraco";
  reembolsoUsado: boolean;
}
export interface SamePersonSignal {
  userId: string;
  accountType: string;
  name: string;
  emailMasked: string;
  joinedAt: string;
  nivel: "forte" | "fraco";
  others: SamePersonOther[];
  refundUsed: boolean;
}

/** Contas que parecem ser da mesma pessoa (mesmo aparelho, ou mesma rede com contas criadas em datas próximas). Só leitura; o IP nunca é exibido. */
export async function fetchSamePersonSignals(): Promise<SamePersonSignal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_same_person_signals");
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    userId: String(r.user_id),
    accountType: String(r.account_type ?? ""),
    name: String(r.display_name ?? ""),
    emailMasked: String(r.email_masked ?? ""),
    joinedAt: String(r.joined_at ?? ""),
    nivel: r.nivel === "forte" ? "forte" : "fraco",
    refundUsed: r.refund_used === true,
    others: (Array.isArray(r.others) ? (r.others as Record<string, unknown>[]) : []).map((o) => ({
      nome: String(o.nome ?? ""),
      tipo: String(o.tipo ?? ""),
      desde: o.desde ? String(o.desde) : null,
      sinais: (Array.isArray(o.sinais) ? (o.sinais as unknown[]) : []).map((x) => (x === "aparelho" ? "aparelho" : "rede")),
      nivel: o.nivel === "forte" ? "forte" : "fraco",
      reembolsoUsado: o.reembolso_usado === true,
    })),
  }));
}
