import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface StaffLink { houseId: string; houseName: string; ownerId: string; staffName: string; canReply: boolean; canOrders: boolean }
export interface StaffMember { id: string; name: string; canReply: boolean; canOrders: boolean }
export interface StaffInvite { token: string; name: string; canReply: boolean; canOrders: boolean; expiresAt: string }
export interface StaffConversation { id: string; otherId: string; otherName: string; lastText: string; lastAt: string }
export interface StaffMessage { id: string; fromHouse: boolean; text: string; createdAt: string; staffName: string | null; fromAssistant: boolean; attachmentPath: string | null; attachmentType: string | null; attachmentName: string | null; attachmentSize: number | null }
export interface StaffOrder { id: string; title: string; status: string; clientName: string; createdAt: string }

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const friendly = (m?: string) => (m && /Premium|acessos|expirou|usado|conta|casa|acesso|Conversa|Escreva/i.test(m) ? m : "Não foi possível concluir. Tente novamente.");

export const staffInviteUrl = (token: string) => `${window.location.origin}/equipe/convite/${token}`;

/** Vínculo de quem está logado como equipe de uma casa (null se não atende por nenhuma). */
export async function fetchMyStaffLink(): Promise<StaffLink | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_staff_house");
  const r = (data as Row[] | null)?.[0];
  if (error || !r) return null;
  return { houseId: String(r.house_id), houseName: String(r.house_name), ownerId: String(r.owner_id), staffName: String(r.staff_name), canReply: Boolean(r.can_reply), canOrders: Boolean(r.can_orders) };
}

/** Atalho do menu: aparece só para quem atende por uma casa. */
export function useStaffLink(userId?: string): StaffLink | null {
  const [state, setState] = useState<{ id?: string; link: StaffLink | null }>({ link: null });
  useEffect(() => {
    if (!userId || !supabase) return;
    let alive = true;
    void fetchMyStaffLink().then((l) => alive && setState({ id: userId, link: l }));
    return () => {
      alive = false;
    };
  }, [userId]);
  return state.id === userId ? state.link : null;
}

export async function fetchTeam(houseId: string): Promise<{ members: StaffMember[]; invites: StaffInvite[] }> {
  if (!supabase) return { members: [], invites: [] };
  const [m, i] = await Promise.all([
    supabase.from("house_staff").select("id, name, can_reply, can_orders").eq("house_id", houseId).order("created_at"),
    supabase.from("house_staff_invites").select("token, name, can_reply, can_orders, expires_at").eq("house_id", houseId).is("used_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  return {
    members: ((m.data ?? []) as Row[]).map((r) => ({ id: String(r.id), name: String(r.name), canReply: Boolean(r.can_reply), canOrders: Boolean(r.can_orders) })),
    invites: ((i.data ?? []) as Row[]).map((r) => ({ token: String(r.token), name: String(r.name), canReply: Boolean(r.can_reply), canOrders: Boolean(r.can_orders), expiresAt: String(r.expires_at) })),
  };
}
export async function createStaffInvite(houseId: string, name: string, canReply: boolean, canOrders: boolean): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.from("house_staff_invites").insert({ house_id: houseId, name: name.trim(), can_reply: canReply, can_orders: canOrders });
  return error ? friendly(error.message) : null;
}
export async function cancelStaffInvite(token: string): Promise<boolean> {
  if (!supabase) return false;
  return !(await supabase.from("house_staff_invites").delete().eq("token", token)).error;
}
export async function updateStaff(id: string, patch: { canReply?: boolean; canOrders?: boolean }): Promise<boolean> {
  if (!supabase) return false;
  const body: Row = {};
  if (patch.canReply !== undefined) body.can_reply = patch.canReply;
  if (patch.canOrders !== undefined) body.can_orders = patch.canOrders;
  return !(await supabase.from("house_staff").update(body).eq("id", id)).error;
}
export async function removeStaff(id: string): Promise<boolean> {
  if (!supabase) return false;
  return !(await supabase.from("house_staff").delete().eq("id", id)).error;
}
export async function acceptStaffInvite(token: string): Promise<{ houseName?: string; error?: string }> {
  if (!supabase) return { error: "Indisponível." };
  const { data, error } = await supabase.rpc("accept_staff_invite", { p_token: token });
  return error ? { error: friendly(error.message) } : { houseName: String(data) };
}

export async function fetchStaffConversations(): Promise<StaffConversation[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("staff_conversations");
  return ((data ?? []) as Row[]).map((r) => ({ id: String(r.conversation_id), otherId: String(r.other_id), otherName: String(r.other_name), lastText: String(r.last_text ?? ""), lastAt: String(r.last_at ?? "") }));
}
export async function fetchStaffMessages(conv: string): Promise<StaffMessage[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("staff_messages", { p_conv: conv });
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id), fromHouse: Boolean(r.from_house), text: String(r.text), createdAt: String(r.created_at), staffName: r.staff_name ?? null, fromAssistant: Boolean(r.from_assistant),
    attachmentPath: r.attachment_path ?? null, attachmentType: r.attachment_type ?? null, attachmentName: r.attachment_name ?? null, attachmentSize: r.attachment_size ?? null,
  }));
}
export async function staffSend(conv: string, text: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("staff_send", { p_conv: conv, p_text: text });
  return error ? friendly(error.message) : null;
}
export async function fetchStaffOrders(): Promise<StaffOrder[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("staff_orders");
  return ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), title: String(r.title), status: String(r.status), clientName: String(r.client_name), createdAt: String(r.created_at) }));
}
