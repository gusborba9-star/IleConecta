import { supabase } from "@/lib/supabase";

export interface Peer {
  id: string;
  name: string;
  avatar: string | null;
  isHouse: boolean;
  online: boolean;
}

export interface ConversationRow {
  id: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  otherIsHouse: boolean;
  lastText: string | null;
  lastAt: string;
  lastFromAssistant: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  fromAssistant: boolean;
  createdAt: string;
  read: boolean;
  deliveredAt: string | null;
  deletedAt: string | null;
  attachmentPath: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
}

export async function touchPresence(): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("touch_presence");
  await supabase.rpc("mark_delivered"); // ✓✓: o app está aberto, então o que chegou foi entregue
}

/** Marca como lidas as mensagens do outro nesta conversa (✓✓ colorido para ele). */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("mark_conversation_read", { p_conv: conversationId });
}

/** Apaga a própria mensagem para todos (até 2 dias depois de enviada). */
export async function deleteMessage(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("delete_message", { p_id: id });
  return !error;
}

export async function fetchPeer(otherId: string): Promise<Peer | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("peer_info", { p_other: otherId });
  const r = Array.isArray(data) ? data[0] : null;
  return r ? { id: String(r.id), name: String(r.name), avatar: r.avatar_url ?? null, isHouse: Boolean(r.is_house), online: Boolean(r.online) } : null;
}

export async function openConversation(otherId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("open_conversation", { p_other: otherId });
  return error || typeof data !== "string" ? null : data;
}

export async function listConversations(): Promise<ConversationRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("my_conversations");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []).map((r) => ({
    id: String(r.conversation_id),
    otherId: String(r.other_id),
    otherName: String(r.other_name),
    otherAvatar: r.other_avatar ?? null,
    otherIsHouse: Boolean(r.other_is_house),
    lastText: r.last_text ?? null,
    lastAt: String(r.last_at),
    lastFromAssistant: Boolean(r.last_from_assistant),
  }));
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, text, from_assistant, created_at, read, delivered_at, deleted_at, attachment_path, attachment_type, attachment_name, attachment_size")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((m) => ({ id: String(m.id), senderId: String(m.sender_id), text: String(m.text), fromAssistant: Boolean(m.from_assistant), createdAt: String(m.created_at), read: Boolean(m.read), deliveredAt: m.delivered_at ?? null, deletedAt: m.deleted_at ?? null, attachmentPath: m.attachment_path ?? null, attachmentType: m.attachment_type ?? null, attachmentName: m.attachment_name ?? null, attachmentSize: m.attachment_size ?? null }));
}

/** Mensagem direta (sem assistente). "blocked" quando o destinatário bloqueou quem envia. */
export async function sendDirect(conversationId: string, senderId: string, text: string): Promise<"ok" | "blocked" | "error"> {
  if (!supabase) return "error";
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: senderId, text: text.slice(0, 2000), from_assistant: false });
  if (!error) return "ok";
  return error.message?.includes("blocked") ? "blocked" : "error";
}

/** Avisa quando chegar mensagem nova (ou mudança de leitura/exclusão) em qualquer conversa minha. Devolve a função de cancelar. */
export function subscribeMessages(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`messages-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange).subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/** Eu bloqueei este contato? */
export async function fetchIBlocked(otherId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.rpc("chat_block_state", { p_other: otherId });
  return data === true;
}

export async function setBlocked(otherId: string, blocked: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = blocked ? await supabase.rpc("block_user", { p_other: otherId }) : await supabase.rpc("unblock_user", { p_other: otherId });
  return !error;
}

export const REPORT_REASONS = [
  { id: "spam", label: "Spam ou propaganda" },
  { id: "ofensa", label: "Ofensa ou assédio" },
  { id: "golpe", label: "Golpe ou pedido de dinheiro por fora" },
  { id: "conteudo_improprio", label: "Conteúdo impróprio" },
  { id: "outro", label: "Outro motivo" },
] as const;

export async function reportUser(otherId: string, reason: string, details: string, evidence: { path: string; name: string; type: string }[] = []): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("report_user", { p_other: otherId, p_reason: reason, p_details: details, p_evidence: evidence });
  return !error;
}
