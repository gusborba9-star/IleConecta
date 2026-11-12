import { supabase } from "@/lib/supabase";

export interface OpenInput {
  kind: string; title: string; description: string;
  contextType?: "pedido" | "reserva" | "pagamento" | "reembolso" | "avaliacao" | "conversa" | null;
  contextId?: string | null; subject?: string | null; source?: "pessoa" | "assistente";
}
export interface MyCase { id: string; kind: string; priority: string; status: string; title: string; role: "autor" | "envolvido"; created_at: string; updated_at: string; decision: string | null }
export interface CaseMessage { id: string; de: string; texto: string; em: string }
export interface CaseEvidence { id: string; path: string; nota: string | null; em: string }
export interface CaseDetail {
  id: string; papel: "autor" | "envolvido"; tipo: string; prioridade: string; status: string; criado_em: string; titulo: string; resumo: string | null;
  prazo_primeira_resposta: string | null; decisao: string | null; decisao_nota: string | null; mensagens: CaseMessage[]; provas: CaseEvidence[];
}
export interface AccountStatus { suspensa: boolean; exclusao: { id: string; executa_em: string } | null; impedimentos: string[] }

const msg = (e: { message?: string } | null, fallback: string) => (e?.message && !/^(fetch|network|TypeError)/i.test(e.message) ? e.message : fallback);
/** O projeto roda sem strictNullChecks, então o resultado é um objeto simples: confira `ok` antes de usar `data`. */
export interface Res<T> { ok: boolean; data: T; error: string }

async function rpc<T>(name: string, args: Record<string, unknown> | undefined, fallback: string): Promise<Res<T>> {
  if (!supabase) return { ok: false, data: undefined as never, error: "Indisponível neste modo de demonstração." };
  const { data, error } = await supabase.rpc(name, args);
  return error ? { ok: false, data: undefined as never, error: msg(error, fallback) } : { ok: true, data: data as T, error: "" };
}

export const openCase = (i: OpenInput) =>
  rpc<string>("open_support_case", { p_kind: i.kind, p_title: i.title.trim(), p_description: i.description.trim(), p_context_type: i.contextType ?? null, p_context_id: i.contextId ?? null, p_subject: i.subject ?? null, p_source: i.source ?? "pessoa" }, "Não foi possível enviar. Tente novamente.");
export const myCases = () => rpc<MyCase[]>("my_support_cases", undefined, "Não foi possível carregar seus chamados.");
export const myCase = (id: string) => rpc<CaseDetail>("my_support_case", { p_id: id }, "Chamado não encontrado.");
export const addCaseMessage = (id: string, body: string) => rpc<string>("add_support_case_message", { p_case: id, p_body: body.trim() }, "Não foi possível enviar a mensagem.");
export const sendEvidence = (id: string, path: string, note: string, consent: boolean) => rpc<string>("submit_support_evidence", { p_case: id, p_path: path, p_note: note.trim(), p_consent: consent }, "Não foi possível enviar o arquivo.");
export const supportEmail = async (): Promise<string | null> => {
  const r = await rpc<string | null>("support_contact_email", undefined, "");
  return r.ok ? r.data : null;
};
export const accountStatus = () => rpc<AccountStatus>("my_account_status", undefined, "Não foi possível ler o estado da conta.");
export const exportMyData = () => rpc<Record<string, unknown>>("export_my_data", undefined, "Não foi possível exportar.");
export const requestDeletion = () => rpc<string>("request_account_deletion", { p_confirm: "EXCLUIR" }, "Não foi possível pedir a exclusão.");
export const cancelDeletion = () => rpc<null>("cancel_account_deletion", undefined, "Não foi possível cancelar.");

// ---- administração
export interface QueueRow {
  id: string; kind: string; priority: string; status: string; title: string; opener_name: string | null; subject_name: string | null; house_name: string | null;
  first_response_due: string; first_response_at: string | null; overdue: boolean; created_at: string;
}
export interface Retained { nome: string | null; email: string | null; excluida_em: string }
export interface Party { id: string; nome: string; tipo_conta: string; excluida: boolean; identidade_retida: Retained | null; convidado?: boolean }
export interface Dossier {
  caso: Record<string, unknown> & { id: string; kind: string; priority: string; status: string; title: string; description: string; neutral_summary: string | null; decision: string | null };
  autor: Party | null; envolvido: Party | null;
  fatos: { id: string; em: string; por: string | null; fatos: Record<string, unknown> }[];
  mensagens: { id: string; canal: string; de: string; papel: string; texto: string; em: string }[];
  provas: { id: string; enviada_por: string; canal: string; path: string; nota: string | null; consentimento_em: string }[];
  registro: { em: string; quem: string | null; acao: string; motivo: string | null; dados: Record<string, unknown> | null }[];
}
export const adminQueue = (status: string | null) => rpc<QueueRow[]>("admin_support_queue", { p_status: status }, "Não foi possível carregar a fila.");
export const adminDossier = (id: string, reason: string) => rpc<Dossier>("admin_support_dossier", { p_id: id, p_reason: reason }, "Não foi possível abrir o dossiê.");
export const adminRefreshFacts = (id: string, reason: string) => rpc<unknown>("admin_support_refresh_facts", { p_id: id, p_reason: reason }, "Não foi possível atualizar os fatos.");
export const adminReply = (id: string, channel: "autor" | "envolvido" | "interna", body: string) => rpc<string>("admin_support_reply", { p_case: id, p_channel: channel, p_body: body.trim() }, "Não foi possível responder.");
export const adminRequestVersion = (id: string, summary: string) => rpc<unknown>("admin_support_request_version", { p_case: id, p_neutral_summary: summary.trim() }, "Não foi possível pedir a versão.");
export const adminSetStatus = (id: string, status: string, reason: string) => rpc<unknown>("admin_support_set_status", { p_case: id, p_status: status, p_reason: reason }, "Não foi possível mudar o estado.");
export const adminDecide = (id: string, decision: string, note: string, refuse: boolean) => rpc<unknown>("admin_support_decide", { p_case: id, p_decision: decision, p_note: note.trim(), p_refuse: refuse }, "Não foi possível decidir.");
export const adminSetEmail = (email: string, reason: string) => rpc<unknown>("admin_set_support_email", { p_email: email.trim() || null, p_reason: reason.trim() }, "Não foi possível salvar o e-mail.");
export const adminSuspend = (user: string, reason: string, caseId: string | null) => rpc<unknown>("admin_suspend_account", { p_user: user, p_reason: reason.trim(), p_case: caseId }, "Não foi possível suspender.");
export const adminUnsuspend = (user: string, reason: string) => rpc<unknown>("admin_unsuspend_account", { p_user: user, p_reason: reason.trim() }, "Não foi possível reativar.");
export const adminIdentity = (user: string, reason: string, caseId: string | null) => rpc<{ nome: string | null; email: string | null; tipo_conta: string; casas: string[]; excluida_em: string; guardada_ate: string }>("admin_deleted_identity", { p_user: user, p_reason: reason.trim(), p_case: caseId }, "Não foi possível consultar.");

export type AccountAction = "send_password_reset" | "resend_confirmation" | "account_state";
/** Ações de conta que precisam do servidor de autenticação (função de borda support-admin). */
export async function adminAccountAction(action: AccountAction, userId: string, reason: string, caseId: string | null): Promise<Res<Record<string, unknown>>> {
  if (!supabase) return { ok: false, data: undefined as never, error: "Indisponível." };
  const { data, error } = await supabase.functions.invoke("support-admin", { body: { action, user_id: userId, reason: reason.trim(), case_id: caseId, redirect_to: `${window.location.origin}/redefinir-senha` } });
  if (error) {
    try {
      const b = (await (error as { context?: Response }).context?.json()) as { message?: string } | undefined;
      return { ok: false, data: undefined as never, error: b?.message ?? "Não foi possível executar." };
    } catch { return { ok: false, data: undefined as never, error: "Não foi possível executar." }; }
  }
  return { ok: true, data: (data ?? {}) as Record<string, unknown>, error: "" };
}
