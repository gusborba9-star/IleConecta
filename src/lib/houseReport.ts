import { supabase } from "@/lib/supabase";

export interface AssistantReport {
  days: number;
  plan: "base" | "intermediario" | "maximo";
  assistantReplies: number;
  clientsAttended: number;
  handoffs: number;
  nightContacts: number;
  nightContacts24h: number;
  contacts24h: number;
  ordersAfterChat: number;
  ordersAfterChatCents: number;
  seatsAfterChat: number;
  repliesByHour: number[];
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function fetchAssistantReport(days = 7): Promise<AssistantReport | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("house_assistant_report", { p_days: days });
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const hours = Array.isArray(r.replies_by_hour) ? r.replies_by_hour.map(n) : [];
  return {
    days: n(r.days) || days,
    plan: r.plan === "intermediario" || r.plan === "maximo" ? r.plan : "base",
    assistantReplies: n(r.assistant_replies),
    clientsAttended: n(r.clients_attended),
    handoffs: n(r.handoffs),
    nightContacts: n(r.night_contacts),
    nightContacts24h: n(r.night_contacts_24h),
    contacts24h: n(r.contacts_24h),
    ordersAfterChat: n(r.orders_after_chat),
    ordersAfterChatCents: n(r.orders_after_chat_cents),
    seatsAfterChat: n(r.seats_after_chat),
    repliesByHour: Array.from({ length: 24 }, (_, i) => hours[i] ?? 0),
  };
}

export interface QuietPrefs { on: boolean; start: number; end: number }
export const DEFAULT_QUIET: QuietPrefs = { on: false, start: 22, end: 7 };

export async function fetchQuietPrefs(userId: string): Promise<QuietPrefs> {
  if (!supabase) return DEFAULT_QUIET;
  const { data } = await supabase.from("notification_prefs").select("quiet_on, quiet_start, quiet_end").eq("user_id", userId).maybeSingle();
  if (!data) return DEFAULT_QUIET;
  return { on: Boolean(data.quiet_on), start: n(data.quiet_start), end: n(data.quiet_end) };
}

export async function saveQuietPrefs(userId: string, p: QuietPrefs): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("notification_prefs").upsert({
    user_id: userId, quiet_on: p.on, quiet_start: p.start, quiet_end: p.end, updated_at: new Date().toISOString(),
  });
  return !error;
}
