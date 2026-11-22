import { rememberPlanGuard } from "@/lib/planGuard";
import { supabase } from "@/lib/supabase";
import { subscribeLive } from "@/lib/live";
import { refundCancelled } from "@/lib/payments";
import type { IntakeField, RitualMode, RitualValue } from "@/lib/ritualsCore";

export type EventStatus = "rascunho" | "publicado" | "encerrado" | "cancelado";

export interface RealRitual {
  id: string;
  houseId: string; // houses.id (banco)
  ownerId: string | null; // id usado nas rotas /casa/:id
  houseName: string;
  title: string;
  description: string | null;
  priceCents: number;
  seatsTotal: number;
  mode: RitualMode;
  startsAt: string;
  durationMin: number | null;
  status: EventStatus;
  startedAt: string | null;
  fields: IntakeField[];
  taken: number;
}

const COLS = "id, house_id, title, description, price_cents, seats_total, mode, starts_at, duration_min, status, started_at, intake_fields, houses(owner_id, name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRitual = (r: Record<string, any>, taken: number): RealRitual => ({
  id: String(r.id),
  houseId: String(r.house_id),
  ownerId: r.houses?.owner_id ? String(r.houses.owner_id) : null,
  houseName: r.houses?.name ? String(r.houses.name) : "Casa",
  title: String(r.title),
  description: r.description ?? null,
  priceCents: Number(r.price_cents),
  seatsTotal: Number(r.seats_total),
  mode: r.mode,
  startsAt: String(r.starts_at),
  durationMin: r.duration_min == null ? null : Number(r.duration_min),
  status: r.status,
  startedAt: r.started_at ?? null,
  fields: Array.isArray(r.intake_fields) ? r.intake_fields : [],
  taken,
});

async function takenOf(id: string): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.rpc("event_taken", { p_event: id });
  return Number(data ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withTaken(rows: Record<string, any>[]): Promise<RealRitual[]> {
  const takens = await Promise.all(rows.map((r) => takenOf(String(r.id))));
  return rows.map((r, i) => toRitual(r, takens[i]));
}

/** O banco já esconde rascunhos de quem não é a dona da casa. */
export async function fetchHouseRituals(ownerId: string): Promise<RealRitual[]> {
  if (!supabase) return [];
  const { data: h } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!h) return [];
  const { data, error } = await supabase.from("events").select(COLS).eq("house_id", h.id).order("starts_at", { ascending: true });
  if (error || !data) {
    console.error("Ilê Conecta: não foi possível carregar os rituais.", error?.message);
    return [];
  }
  return withTaken(data);
}

/** Linha do catálogo de busca: ritual publicado, sem as vagas (que se buscam à parte, só do que aparece) e com o selo da casa. */
export type CatalogRitual = RealRitual & { houseVerified: boolean };
export const CATALOG_LIMIT = 500;
const CATALOG_COLS = `${COLS.replace("houses(owner_id, name)", "houses(owner_id, name, verified)")}`;

/** Todos os rituais publicados de hoje em diante, os mais próximos primeiro, até CATALOG_LIMIT. `extraIds` traz impulsionados que ficaram fora do corte. */
export async function fetchRitualCatalog(extraIds: string[] = []): Promise<{ items: CatalogRitual[]; total: number }> {
  if (!supabase) return { items: [], total: 0 };
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data, error, count } = await supabase.from("events").select(CATALOG_COLS, { count: "exact" })
    .eq("status", "publicado").gt("starts_at", since).order("starts_at", { ascending: true }).limit(CATALOG_LIMIT);
  if (error || !data) return { items: [], total: 0 };
  let rows = data as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const have = new Set(rows.map((r) => String(r.id)));
  const missing = extraIds.filter((id) => !have.has(id)).slice(0, 50);
  if (missing.length) {
    const { data: more } = await supabase.from("events").select(CATALOG_COLS).eq("status", "publicado").gt("starts_at", since).in("id", missing);
    if (more) rows = [...rows, ...(more as Record<string, any>[])]; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const items = rows.map((r) => ({ ...toRitual(r, 0), houseVerified: r.houses?.verified === true }));
  return { items, total: Math.max(count ?? items.length, items.length) };
}

/** Vagas ocupadas de uma lista de rituais (uma consulta por ritual, só dos que a tela precisa). */
export async function fetchTakenMany(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(ids.map(async (id) => { out[id] = await takenOf(id); }));
  return out;
}

export async function fetchPublishedRituals(): Promise<RealRitual[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("events")
    .select(COLS)
    .eq("status", "publicado")
    .gt("starts_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);
  if (error || !data) return [];
  return withTaken(data);
}

export async function createRitual(ownerId: string, v: RitualValue, publish: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { data: h } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!h) return false;
  const { stream_url, ...row } = v;
  const { data, error } = await supabase.from("events").insert({ house_id: h.id, ...row, status: publish ? "publicado" : "rascunho" }).select("id").single();
  if (error) rememberPlanGuard(error);
  if (error || !data) return false;
  if (stream_url) await supabase.from("event_secrets").upsert({ event_id: data.id, stream_url });
  return true;
}

export async function updateRitual(id: string, v: RitualValue): Promise<boolean> {
  if (!supabase) return false;
  const { stream_url, ...row } = v;
  const { error } = await supabase.from("events").update(row).eq("id", id);
  if (error) { rememberPlanGuard(error); return false; }
  const { error: e2 } = stream_url
    ? await supabase.from("event_secrets").upsert({ event_id: id, stream_url })
    : await supabase.from("event_secrets").delete().eq("event_id", id);
  return !e2;
}

export async function setRitualStatus(id: string, status: EventStatus): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("events").update({ status }).eq("id", id);
  if (error) rememberPlanGuard(error);
  return !error;
}

export type LifecycleResult = { ok: true; notified: number } | { ok: false; message: string };

async function lifecycle(fn: "start_event" | "finish_event", id: string): Promise<LifecycleResult> {
  if (!supabase) return { ok: false, message: "Indisponível." };
  const { data, error } = await supabase.rpc(fn, { p_event: id });
  if (error) return { ok: false, message: error.message || "Não foi possível concluir." };
  return { ok: true, notified: Number(data ?? 0) };
}

/** A casa inicia o ritual: fecha as reservas e avisa todos os participantes. */
export const startRitual = (id: string) => lifecycle("start_event", id);
/** A casa conclui o ritual: encerra e avisa todos os participantes. */
export const finishRitual = (id: string) => lifecycle("finish_event", id);

export async function fetchStreamUrl(id: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("event_stream_url", { p_event: id });
  return typeof data === "string" ? data : null;
}

export interface MyReservation { id: string; status: string }

export async function fetchMyReservations(userId: string): Promise<Record<string, MyReservation>> {
  if (!supabase) return {};
  const { data } = await supabase.from("reservations").select("id, event_id, status").eq("user_id", userId).in("status", ["confirmada", "aguardando_pagamento"]);
  const out: Record<string, MyReservation> = {};
  for (const r of data ?? []) out[String(r.event_id)] = { id: String(r.id), status: String(r.status) };
  return out;
}

export interface MyUpcomingReservation { id: string; status: string; title: string; houseName: string; startsAt: string }

/** Reservas do cliente (confirmadas ou a pagar) de rituais que ainda não passaram — alimenta o "Para você" do Início. */
export async function fetchMyUpcomingReservations(userId: string): Promise<MyUpcomingReservation[]> {
  if (!supabase) return [];
  const { data: rs } = await supabase.from("reservations").select("id, event_id, status").eq("user_id", userId).in("status", ["confirmada", "aguardando_pagamento"]);
  if (!rs?.length) return [];
  const { data: evs } = await supabase.from("events").select("id, title, starts_at, houses(name)").in("id", rs.map((r) => r.event_id)).gt("starts_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString());
  const byId = new Map((evs ?? []).map((e) => [String(e.id), e]));
  const out: MyUpcomingReservation[] = [];
  for (const r of rs) {
    const e = byId.get(String(r.event_id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (e) out.push({ id: String(r.id), status: String(r.status), title: String(e.title), houseName: String((e as any).houses?.name ?? "Casa"), startsAt: String(e.starts_at) });
  }
  return out;
}

/** Donos das casas onde a pessoa já reservou vaga (vínculo para o alcance do Início). */
export async function fetchMyReservationOwners(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("reservations").select("events(houses(owner_id))").eq("user_id", userId).limit(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...new Set((data ?? []).flatMap((r: any) => { const e = Array.isArray(r.events) ? r.events[0] : r.events; const h = Array.isArray(e?.houses) ? e.houses[0] : e?.houses; return h?.owner_id ? [String(h.owner_id)] : []; }))];
}

/** Devolve null em caso de sucesso, ou a mensagem de erro em português. */
/** Reserva a vaga. Devolve o erro (ou null) e o id da reserva, usado para abrir o pagamento. */
export async function reserveSeat(eventId: string, answers: Record<string, string>): Promise<{ error: string | null; id: string | null }> {
  if (!supabase) return { error: "Indisponível.", id: null };
  const { data, error } = await supabase.rpc("reserve_event", { p_event: eventId, p_answers: answers });
  return error ? { error: error.message, id: null } : { error: null, id: data ? String(data) : null };
}

export async function cancelSeat(reservationId: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("cancel_reservation", { p_id: reservationId });
  if (error) return error.message;
  await refundCancelled("reserva", reservationId); // se já estava paga, devolve o valor integral pelo Stripe
  return null;
}

export interface Attendee { reservationId: string; name: string; status: string; answers: Record<string, string>; createdAt: string }

export async function fetchAttendees(eventId: string): Promise<Attendee[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("event_attendees", { p_event: eventId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []).map((r) => ({ reservationId: String(r.reservation_id), name: String(r.name), status: String(r.status), answers: r.answers ?? {}, createdAt: String(r.created_at) }));
}

/** Avisa quando houver mudança de reservas (a casa vê as vagas na hora). Devolve a função de cancelar. */
export function subscribeReservations(onChange: () => void): () => void {
  return subscribeLive("reservations", onChange);
}

/** Eventos em que a pessoa está na fila de espera. */
export async function fetchMyWaitlist(userId: string): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data } = await supabase.from("event_waitlist").select("event_id").eq("user_id", userId);
  return new Set((data ?? []).map((r) => String(r.event_id)));
}

/** Quantas pessoas esperam vaga em cada ritual (só a dona da casa enxerga). */
export async function fetchWaitlistCounts(): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data } = await supabase.from("event_waitlist").select("event_id");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[String(r.event_id)] = (out[String(r.event_id)] ?? 0) + 1;
  return out;
}

/** Entra na fila. Devolve o erro em português ou null. */
export async function joinWaitlist(eventId: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("join_event_waitlist", { p_event: eventId });
  return error ? error.message : null;
}

export async function leaveWaitlist(eventId: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("leave_event_waitlist", { p_event: eventId });
  return error ? error.message : null;
}

let publishedCache: { at: number; p: Promise<RealRitual[]> } | null = null;
/** Rituais publicados, lidos uma vez a cada 60 s (vários cartões do feed usam a mesma lista). */
export function fetchPublishedRitualsCached(): Promise<RealRitual[]> {
  if (!publishedCache || Date.now() - publishedCache.at > 60_000) publishedCache = { at: Date.now(), p: fetchPublishedRituals() };
  return publishedCache.p;
}
