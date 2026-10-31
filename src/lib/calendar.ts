import { supabase } from "@/lib/supabase";
import type { CalendarKind } from "@/lib/calendarCore";

export type { CalendarKind };

export interface CalendarItem {
  id: string;
  title: string;
  tradition: string | null;
  kind: CalendarKind;
  date: string;
  yearly: boolean;
  note: string | null;
  public: boolean;
}
export interface HouseCalendar {
  enabled: boolean;
  items: CalendarItem[];
}
export interface CalendarDraft {
  id?: string;
  title: string;
  tradition: string;
  kind: CalendarKind;
  date: string;
  yearly: boolean;
  note: string;
  public: boolean;
}

/** A casa vê tudo; os demais (mesmo sem login) só o que ela marcou como público. Desligado → enabled=false. */
export async function fetchHouseCalendar(ownerId: string): Promise<HouseCalendar> {
  if (!supabase) return { enabled: false, items: [] };
  const { data, error } = await supabase.rpc("house_calendar", { p_owner: ownerId });
  const d = data as { enabled?: boolean; items?: Record<string, unknown>[] } | null;
  if (error || !d || d.enabled !== true) return { enabled: false, items: [] };
  return {
    enabled: true,
    items: (d.items ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      tradition: r.tradition ? String(r.tradition) : null,
      kind: (["celebracao", "obrigacao", "gira"].includes(String(r.kind)) ? r.kind : "outro") as CalendarKind,
      date: String(r.date).slice(0, 10),
      yearly: r.yearly !== false,
      note: r.note ? String(r.note) : null,
      public: r.public !== false,
    })),
  };
}

/** Devolve a mensagem de erro, ou null se salvou. */
export async function saveCalendarItem(d: CalendarDraft): Promise<string | null> {
  if (!supabase) return "Sem conexão com o servidor.";
  const { error } = await supabase.rpc("save_calendar_item", {
    p_id: d.id ?? null, p_title: d.title, p_tradition: d.tradition, p_kind: d.kind, p_date: d.date, p_yearly: d.yearly, p_note: d.note, p_public: d.public,
  });
  return error ? error.message : null;
}

export async function deleteCalendarItem(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("delete_calendar_item", { p_id: id });
  return !error;
}
