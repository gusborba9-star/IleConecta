import { supabase } from "@/lib/supabase";
import { toHandoff, type Handoff } from "@/lib/handoffCore";

/** Estado do atendimento da conversa (quem está com ela). Qualquer falha vira "automação": nunca bloqueia o chat. */
export async function fetchHandoff(conversationId: string): Promise<Handoff> {
  if (!supabase) return toHandoff(null);
  const { data, error } = await supabase.rpc("conversation_handoff_state", { p_conv: conversationId });
  if (error) return toHandoff(null);
  return toHandoff(Array.isArray(data) ? data[0] : data);
}

/** A casa (ou a equipe com permissão) assume a conversa: a assistente para de responder. */
export async function takeConversation(conversationId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("handoff_take", { p_conv: conversationId });
  return !error;
}

/** Devolve a conversa à assistente. */
export async function releaseConversation(conversationId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("handoff_release", { p_conv: conversationId });
  return !error;
}
