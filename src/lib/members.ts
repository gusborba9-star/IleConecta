import { supabase } from "@/lib/supabase";

export type MemberSituation = "vencida" | "perto" | "em_dia" | "sem_mensalidade";
export type DueStatus = "aberta" | "paga" | "dispensada";

export interface MemberDue {
  id: string;
  month: string; // YYYY-MM-01
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  status: DueStatus;
  paidVia: "app" | "manual" | null;
}

export interface HouseMember {
  id: string;
  name: string;
  bond: string | null;
  note: string | null;
  monthlyCents: number;
  dueDay: number;
  hasAccount: boolean;
  situation: MemberSituation;
  lateCount: number;
  lateCents: number;
  dues: MemberDue[];
}

export interface MembersOverview {
  summary: { total: number; vencidas: number; perto: number; emDia: number; atrasadoCents: number };
  members: HouseMember[];
}

export interface Membership {
  memberId: string;
  houseName: string;
  houseSlug: string | null;
  ownerId: string;
  monthlyCents: number;
  dueDay: number;
  canPayApp: boolean;
  dues: MemberDue[];
}

export interface InvitePreview {
  houseName: string;
  houseSlug: string | null;
  memberName: string | null;
  isOwner: boolean;
  alreadyMember: boolean;
}

export const BOND_OPTIONS = ["Filho(a) de santo", "Ogã", "Ekede", "Adepto(a)", "Frequentador(a)"] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
const toDue = (d: any): MemberDue => ({
  id: String(d.id),
  month: String(d.month),
  amountCents: Number(d.amount_cents),
  dueDate: String(d.due_date),
  status: d.status,
  paidVia: d.paid_via ?? null,
});

function toMember(m: any): HouseMember {
  return {
    id: String(m.id),
    name: String(m.name),
    bond: m.bond ?? null,
    note: m.note ?? null,
    monthlyCents: Number(m.monthly_cents),
    dueDay: Number(m.due_day),
    hasAccount: Boolean(m.has_account),
    situation: m.situacao,
    lateCount: Number(m.late_count),
    lateCents: Number(m.late_cents),
    dues: Array.isArray(m.dues) ? m.dues.map(toDue) : [],
  };
}

/** Executa uma função do banco e devolve a mensagem de erro em português (ou null se deu certo). */
async function run(fn: string, args: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
  if (!supabase) return { data: null, error: "Sem conexão com o servidor." };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: error.message || "Não foi possível concluir. Tente novamente." };
  return { data, error: null };
}

export async function fetchMembersOverview(): Promise<MembersOverview | null> {
  const { data, error } = await run("house_members_overview", {});
  if (error || !data) return null;
  const s = data.summary ?? {};
  return {
    summary: { total: Number(s.total ?? 0), vencidas: Number(s.vencidas ?? 0), perto: Number(s.perto ?? 0), emDia: Number(s.em_dia ?? 0), atrasadoCents: Number(s.atrasado_cents ?? 0) },
    members: Array.isArray(data.members) ? data.members.map(toMember) : [],
  };
}

export async function fetchMemberDefaults(): Promise<{ cents: number; dueDay: number }> {
  if (!supabase) return { cents: 0, dueDay: 10 };
  const { data } = await supabase.from("house_member_settings").select("default_cents, default_due_day").maybeSingle();
  return { cents: Number(data?.default_cents ?? 0), dueDay: Number(data?.default_due_day ?? 10) };
}

export interface MemberInput {
  name: string;
  bond: string;
  note: string;
  cents: number;
  dueDay: number;
}

export async function addMember(v: MemberInput): Promise<string | null> {
  const { error } = await run("house_member_add", { p_name: v.name, p_bond: v.bond, p_note: v.note, p_cents: v.cents, p_due_day: v.dueDay });
  return error;
}
export async function updateMember(id: string, v: MemberInput): Promise<string | null> {
  const { error } = await run("house_member_update", { p_id: id, p_name: v.name, p_bond: v.bond, p_note: v.note, p_cents: v.cents, p_due_day: v.dueDay });
  return error;
}
export async function removeMember(id: string): Promise<string | null> {
  return (await run("house_member_remove", { p_id: id })).error;
}
export async function setMemberDefaults(cents: number, dueDay: number): Promise<string | null> {
  return (await run("house_member_set_defaults", { p_cents: cents, p_due_day: dueDay })).error;
}
export async function markDuePaid(id: string): Promise<string | null> {
  return (await run("house_member_mark_paid", { p_due: id })).error;
}
export async function waiveDue(id: string): Promise<string | null> {
  return (await run("house_member_waive_due", { p_due: id })).error;
}
export async function reopenDue(id: string): Promise<string | null> {
  return (await run("house_member_reopen_due", { p_due: id })).error;
}
/** Link geral da casa (estável) ou, com o id de um membro sem conta, o link só dele. */
export async function createInvite(memberId?: string): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await run("house_member_create_invite", { p_member: memberId ?? null });
  return { token: error ? null : String(data), error };
}
export async function revokeGeneralInvite(): Promise<string | null> {
  return (await run("house_member_revoke_invite", {})).error;
}

export const inviteUrl = (token: string) => `${window.location.origin}/convite/${token}`;

export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  const { data, error } = await run("member_invite_preview", { p_token: token });
  if (error || !data) return null;
  return { houseName: String(data.house_name), houseSlug: data.house_slug ?? null, memberName: data.member_name ?? null, isOwner: Boolean(data.is_owner), alreadyMember: Boolean(data.already_member) };
}
export async function acceptInvite(token: string): Promise<string | null> {
  return (await run("member_invite_accept", { p_token: token })).error;
}

export async function fetchMemberships(): Promise<Membership[]> {
  const { data, error } = await run("my_memberships", {});
  if (error || !Array.isArray(data)) return [];
  return data.map((m: any) => ({
    memberId: String(m.member_id),
    houseName: String(m.house_name),
    houseSlug: m.house_slug ?? null,
    ownerId: String(m.owner_id),
    monthlyCents: Number(m.monthly_cents),
    dueDay: Number(m.due_day),
    canPayApp: Boolean(m.can_pay_app),
    dues: Array.isArray(m.dues) ? m.dues.map(toDue) : [],
  }));
}
export async function leaveHouse(memberId: string): Promise<string | null> {
  return (await run("member_leave", { p_member: memberId })).error;
}

/** "2026-11-01" → "11/2026" */
export const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "2026-11-10" → "10/11" */
export const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
