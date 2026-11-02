import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PermKey = "chat_read" | "chat_reply" | "orders" | "post" | "calendar" | "members" | "stats";
export interface PermInfo { key: PermKey; label: string; hint: string; premiumOnly?: boolean }
/** O que a casa pode liberar, uma ferramenta por vez. Pagamentos, plano, perfil da casa e a própria equipe nunca entram. */
export const PERMS: PermInfo[] = [
  { key: "chat_read", label: "Ver conversas", hint: "Lê as conversas dos clientes com a casa." },
  { key: "chat_reply", label: "Responder conversas", hint: "Responde pela casa, com “Atendido por” e o nome dela. Inclui ver." },
  { key: "orders", label: "Ver pedidos", hint: "Vê a lista de pedidos de serviço, sem alterar nada." },
  { key: "post", label: "Publicar na comunidade", hint: "Publica textos em nome da casa." },
  { key: "calendar", label: "Agenda", hint: "Vê, adiciona e remove datas. Repetição anual e “seguidores” ficam com você." },
  { key: "members", label: "Ver membros", hint: "Só vê a lista e as mensalidades, sem anotações e sem alterar nada. Plano Premium.", premiumOnly: true },
  { key: "stats", label: "Ver números da divulgação", hint: "Só vê visitas dos links e assuntos mais procurados." },
];
/** Liga ou desliga uma permissão mantendo a regra “responder inclui ver”. */
export function togglePerm(perms: PermKey[], key: PermKey, on: boolean): PermKey[] {
  const set = new Set(perms);
  if (on) {
    set.add(key);
    if (key === "chat_reply") set.add("chat_read");
  } else {
    set.delete(key);
    if (key === "chat_read") set.delete("chat_reply");
  }
  return PERMS.map((p) => p.key).filter((k) => set.has(k));
}
export const hasPerm = (perms: PermKey[], key: PermKey) => perms.includes(key) || (key === "chat_read" && perms.includes("chat_reply"));
const toPerms = (v: unknown): PermKey[] => (Array.isArray(v) ? (v.filter((x) => PERMS.some((p) => p.key === x)) as PermKey[]) : []);

export interface StaffLink { houseId: string; houseName: string; ownerId: string; staffName: string; perms: PermKey[] }
export interface StaffMember { id: string; name: string; perms: PermKey[]; active: boolean }
export interface StaffInvite { token: string; name: string; perms: PermKey[]; expiresAt: string }
export interface StaffConversation { id: string; otherId: string; otherName: string; lastText: string; lastAt: string }
export interface StaffMessage { id: string; fromHouse: boolean; text: string; createdAt: string; staffName: string | null; fromAssistant: boolean; attachmentPath: string | null; attachmentType: string | null; attachmentName: string | null; attachmentSize: number | null }
export interface StaffOrder { id: string; title: string; status: string; clientName: string; createdAt: string }

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const friendly = (m?: string) => (m && /Premium|acessos|expirou|usado|conta|casa|acesso|Conversa|Escreva|Dê um|Escolha|Tipo/i.test(m) ? m : "Não foi possível concluir. Tente novamente.");

export const staffInviteUrl = (token: string) => `${window.location.origin}/equipe/convite/${token}`;

/** Vínculo de quem está logado como equipe de uma casa (null se não atende por nenhuma). */
export async function fetchMyStaffLink(): Promise<StaffLink | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_staff_house");
  const r = (data as Row[] | null)?.[0];
  if (error || !r) return null;
  return { houseId: String(r.house_id), houseName: String(r.house_name), ownerId: String(r.owner_id), staffName: String(r.staff_name), perms: toPerms(r.perms) };
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
    supabase.from("house_staff").select("id, name, perms, active").eq("house_id", houseId).order("created_at"),
    supabase.from("house_staff_invites").select("token, name, perms, expires_at").eq("house_id", houseId).is("used_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  return {
    members: ((m.data ?? []) as Row[]).map((r) => ({ id: String(r.id), name: String(r.name), perms: toPerms(r.perms), active: Boolean(r.active) })),
    invites: ((i.data ?? []) as Row[]).map((r) => ({ token: String(r.token), name: String(r.name), perms: toPerms(r.perms), expiresAt: String(r.expires_at) })),
  };
}
export async function createStaffInvite(houseId: string, name: string, perms: PermKey[]): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.from("house_staff_invites").insert({ house_id: houseId, name: name.trim(), perms });
  return error ? friendly(error.message) : null;
}
export async function cancelStaffInvite(token: string): Promise<boolean> {
  if (!supabase) return false;
  return !(await supabase.from("house_staff_invites").delete().eq("token", token)).error;
}
export async function updateStaff(id: string, patch: { perms?: PermKey[]; active?: boolean }): Promise<boolean> {
  if (!supabase) return false;
  const body: Row = {};
  if (patch.perms !== undefined) body.perms = patch.perms;
  if (patch.active !== undefined) body.active = patch.active;
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

/** Quantos acessos além do principal a casa pode ter (1 no Premium + extras contratados). */
export async function fetchSeatAllowance(houseId: string): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.rpc("house_seat_allowance", { h: houseId });
  return typeof data === "number" ? data : 0;
}

export interface StaffDate { id: string; title: string; kind: string; date: string; time: string | null; note: string | null; isPublic: boolean }
export async function staffPost(text: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("staff_post", { p_text: text });
  return error ? friendly(error.message) : null;
}
export async function fetchStaffDates(): Promise<StaffDate[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("staff_calendar_list");
  return ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), title: String(r.title), kind: String(r.kind), date: String(r.on_date), time: r.on_time ? String(r.on_time).slice(0, 5) : null, note: r.note ?? null, isPublic: Boolean(r.vis_public) }));
}
export async function addStaffDate(d: { title: string; kind: string; date: string; time: string; note: string; isPublic: boolean }): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("staff_calendar_add", { p_title: d.title, p_kind: d.kind, p_date: d.date, p_time: d.time || null, p_note: d.note, p_public: d.isPublic });
  return error ? friendly(error.message) : null;
}
export async function removeStaffDate(id: string): Promise<boolean> {
  if (!supabase) return false;
  return !(await supabase.rpc("staff_calendar_delete", { p_id: id })).error;
}
