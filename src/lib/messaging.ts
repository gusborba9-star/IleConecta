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
}

export async function touchPresence(): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("touch_presence");
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
    .select("id, sender_id, text, from_assistant, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((m) => ({ id: String(m.id), senderId: String(m.sender_id), text: String(m.text), fromAssistant: Boolean(m.from_assistant), createdAt: String(m.created_at) }));
}

/** Mensagem direta (sem assistente). Devolve true se gravou. */
export async function sendDirect(conversationId: string, senderId: string, text: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: senderId, text: text.slice(0, 2000), from_assistant: false });
  return !error;
}

/** Avisa quando chegar mensagem nova em qualquer conversa minha. Devolve a função de cancelar. */
export function subscribeMessages(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client.channel(`messages-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, onChange).subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
