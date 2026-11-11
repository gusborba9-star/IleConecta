import { supabase } from "@/lib/supabase";
import { calendarOccurrences, type BusyItem } from "@/lib/agendaCore";
import { fetchHouseCalendar } from "@/lib/calendar";

export interface Window {
  id: string;
  weekday: number;
  start: string;
  end: string;
}
export interface Block {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string;
}

async function houseIdOf(ownerId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  return data ? String(data.id) : null;
}

const hhmm = (t: unknown) => String(t).slice(0, 5);

/** Horários livres dos próximos dias para um serviço com agenda. */
export async function fetchSlots(serviceId: string, days = 21): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("available_slots", { p_service: serviceId, p_days: days });
  if (error || !Array.isArray(data)) return [];
  return (data as { slot: string }[]).map((r) => String(r.slot));
}

export async function fetchWindows(ownerId: string): Promise<Window[]> {
  if (!supabase) return [];
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return [];
  const { data } = await supabase.from("house_availability").select("id, weekday, start_time, end_time").eq("house_id", houseId).order("weekday").order("start_time");
  return (data ?? []).map((r) => ({ id: String(r.id), weekday: Number(r.weekday), start: hhmm(r.start_time), end: hhmm(r.end_time) }));
}

export async function addWindow(ownerId: string, weekday: number, start: string, end: string): Promise<Window | null> {
  if (!supabase) return null;
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return null;
  const { data, error } = await supabase.from("house_availability").insert({ house_id: houseId, weekday, start_time: start, end_time: end }).select("id, weekday, start_time, end_time").single();
  if (error || !data) return null;
  return { id: String(data.id), weekday: Number(data.weekday), start: hhmm(data.start_time), end: hhmm(data.end_time) };
}

export async function removeWindow(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("house_availability").delete().eq("id", id);
  return !error;
}

export async function fetchBlocks(ownerId: string): Promise<Block[]> {
  if (!supabase) return [];
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return [];
  const { data } = await supabase.from("house_blocks").select("id, starts_at, ends_at, note").eq("house_id", houseId).gte("ends_at", new Date().toISOString()).order("starts_at");
  return (data ?? []).map((r) => ({ id: String(r.id), startsAt: String(r.starts_at), endsAt: String(r.ends_at), note: r.note ? String(r.note) : "" }));
}

export async function addBlock(ownerId: string, startsAt: string, endsAt: string, note: string): Promise<Block | null> {
  if (!supabase) return null;
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return null;
  const { data, error } = await supabase.from("house_blocks").insert({ house_id: houseId, starts_at: startsAt, ends_at: endsAt, note: note.trim() || null }).select("id, starts_at, ends_at, note").single();
  if (error || !data) return null;
  return { id: String(data.id), startsAt: String(data.starts_at), endsAt: String(data.ends_at), note: data.note ? String(data.note) : "" };
}

export async function removeBlock(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("house_blocks").delete().eq("id", id);
  return !error;
}

/**
 * Tudo o que já ocupa a agenda da casa (atendimentos contratados, rituais com duração, bloqueios e datas do calendário com hora),
 * para avisar a casa antes de ela cadastrar um horário. Só leitura; falha de rede devolve lista vazia.
 */
export async function fetchBusyItems(ownerId: string): Promise<BusyItem[]> {
  if (!supabase) return [];
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return [];
  const nowIso = new Date().toISOString();
  const [orders, events, blocks, cal] = await Promise.all([
    supabase.from("service_orders").select("title, scheduled_at, ends_at, profiles!service_orders_client_id_fkey(display_name)").eq("house_id", houseId).in("status", ["confirmado", "em_andamento", "aguardando_pagamento"]).not("scheduled_at", "is", null).gte("ends_at", nowIso),
    supabase.from("events").select("title, starts_at, duration_min").eq("house_id", houseId).eq("status", "publicado").not("duration_min", "is", null).gte("starts_at", nowIso),
    supabase.from("house_blocks").select("starts_at, ends_at, note").eq("house_id", houseId).gte("ends_at", nowIso),
    fetchHouseCalendar(ownerId),
  ]);
  const out: BusyItem[] = [];
  for (const o of orders.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const who = (o as any).profiles?.display_name;
    out.push({ startsAt: String(o.scheduled_at), endsAt: String(o.ends_at), label: `${o.title}${who ? ` com ${who}` : ""}` });
  }
  for (const e of events.data ?? []) out.push({ startsAt: String(e.starts_at), endsAt: new Date(new Date(String(e.starts_at)).getTime() + Number(e.duration_min) * 60000).toISOString(), label: `Ritual: ${e.title}` });
  for (const b of blocks.data ?? []) out.push({ startsAt: String(b.starts_at), endsAt: String(b.ends_at), label: b.note ? `Bloqueio: ${b.note}` : "Bloqueio" });
  const today = new Date().toISOString().slice(0, 10);
  out.push(...calendarOccurrences(cal.items.map((c) => ({ title: c.title, onDate: c.date, onTime: c.time, yearly: c.yearly })), today, 60));
  return out;
}
