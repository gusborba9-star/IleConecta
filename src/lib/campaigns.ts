import { supabase } from "@/lib/supabase";
import { publicHouseUrl } from "@/lib/publicHouse";

export const SOURCES = [
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "site", label: "Meu site" },
  { id: "outro", label: "Outro lugar" },
] as const;
export type SourceId = (typeof SOURCES)[number]["id"];

export interface Campaign { id: string; code: string; label: string; source: SourceId; active: boolean; visits: number; contacts: number; visits30: number }
export interface DayCount { day: string; visits: number; contacts: number }
export interface QuickReply { id: string; title: string; body: string }

/** Limites por plano (o banco também confere). */
export const LIMITS = {
  base: { links: 0, replies: 0, cards: 0 },
  intermediario: { links: 2, replies: 3, cards: 1 },
  maximo: { links: 30, replies: 50, cards: 3 },
} as const;

export const campaignUrl = (slug: string, code: string) => `${publicHouseUrl(slug)}?o=${code}`;

const friendly = (m?: string) => (m && /plano|permite|Link não/i.test(m) ? m : "Não foi possível concluir. Tente novamente.");

export async function fetchCampaigns(): Promise<Campaign[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_campaigns_summary");
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), code: String(r.code), label: String(r.label), source: r.source as SourceId, active: Boolean(r.active),
    visits: Number(r.visits), contacts: Number(r.contacts), visits30: Number(r.visits_30d),
  }));
}

export async function createCampaign(houseId: string, source: SourceId, label: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const code = source.slice(0, 2) + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from("house_campaigns").insert({ house_id: houseId, code, label: label.trim(), source });
  return error ? friendly(error.message) : null;
}

export async function removeCampaign(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("house_campaigns").delete().eq("id", id);
  return !error;
}

export async function fetchCampaignDays(id: string, days = 30): Promise<DayCount[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_campaign_days", { p_campaign: id, p_days: days });
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((r) => ({ day: String(r.day), visits: Number(r.visits), contacts: Number(r.contacts) }));
}

/** Conta uma visita ou um toque em "Falar com a casa", sem identificar ninguém. Uma vez por aba. */
export function trackCampaign(slug: string, code: string, kind: "visit" | "contact") {
  if (!supabase || !/^[a-z0-9]{2,12}$/i.test(code)) return;
  const key = `o:${kind}:${slug}:${code}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* sem armazenamento: conta mesmo assim */
  }
  void supabase.rpc("track_campaign", { p_slug: slug, p_code: code, p_kind: kind });
}

export async function houseIdOf(ownerId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function fetchQuickReplies(): Promise<QuickReply[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("house_quick_replies").select("id, title, body").order("created_at");
  return (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title), body: String(r.body) }));
}
export async function addQuickReply(houseId: string, title: string, body: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.from("house_quick_replies").insert({ house_id: houseId, title: title.trim(), body: body.trim() });
  return error ? friendly(error.message) : null;
}
export async function removeQuickReply(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("house_quick_replies").delete().eq("id", id);
  return !error;
}
