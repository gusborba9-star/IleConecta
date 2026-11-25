import { supabase } from "@/lib/supabase";

export interface MemberRequestState {
  houseName: string;
  isMember: boolean;
  iAmHouse: boolean;
  canStart: boolean;
  pending: { id: string; direction: "pedido" | "convite"; mine: boolean } | null;
}

export interface HouseMemberRequest { id: string; userId: string; name: string; direction: "pedido" | "convite"; createdAt: string }

/** Estado do pedido/convite de membro entre quem está logado e a outra conta (nulo quando não se aplica: sem plano, duas casas, etc.). */
export async function fetchMemberRequestState(otherId: string): Promise<MemberRequestState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("member_request_between", { p_other: otherId });
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const p = d.pending as Record<string, unknown> | null | undefined;
  return {
    houseName: String(d.house_name ?? ""),
    isMember: d.is_member === true,
    iAmHouse: d.i_am_house === true,
    canStart: d.can_start === true,
    pending: p && p.id ? { id: String(p.id), direction: p.direction === "convite" ? "convite" : "pedido", mine: p.mine === true } : null,
  };
}

type Res = { ok: boolean; error?: string };
const fail = (m?: string): Res => ({ ok: false, error: m || "Não foi possível concluir agora." });

/** A pessoa pede para ser membro da casa (ownerId = conta da dona). */
export async function requestMembership(ownerId: string): Promise<Res> {
  if (!supabase) return fail("Disponível só com conta real.");
  const { error } = await supabase.rpc("member_request_create", { p_owner: ownerId });
  return error ? fail(error.message) : { ok: true };
}

/** A casa convida quem já conversou com ela pelo chat. */
export async function inviteToMembership(userId: string): Promise<Res> {
  if (!supabase) return fail("Disponível só com conta real.");
  const { error } = await supabase.rpc("member_request_invite", { p_user: userId });
  return error ? fail(error.message) : { ok: true };
}

export async function respondMemberRequest(id: string, accept: boolean): Promise<Res> {
  if (!supabase) return fail("Disponível só com conta real.");
  const { error } = await supabase.rpc("member_request_respond", { p_id: id, p_accept: accept });
  return error ? fail(error.message) : { ok: true };
}

export async function cancelMemberRequest(id: string): Promise<Res> {
  if (!supabase) return fail("Disponível só com conta real.");
  const { error } = await supabase.rpc("member_request_cancel", { p_id: id });
  return error ? fail(error.message) : { ok: true };
}

export async function fetchHouseMemberRequests(): Promise<HouseMemberRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("member_requests_for_house");
  if (error || !Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({ id: String(r.id), userId: String(r.user_id), name: String(r.name ?? "Pessoa"), direction: r.direction === "convite" ? "convite" : "pedido", createdAt: String(r.created_at) }));
}
