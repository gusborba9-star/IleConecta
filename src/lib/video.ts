import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readVideoConfig, type VideoConfig, type VideoKind, type VideoProvider, type VideoRole } from "@/lib/videoCore";

export interface UpcomingMeeting { id: string; houseId: string; houseName: string; kind: VideoKind; title: string; startsAt: string; durationMin: number; isHost: boolean; role: VideoRole; waitingRoom: boolean }
export interface VideoBank { cap: number; used: number; remaining: number; enabled: boolean }
export interface JoinResult { ok: boolean; reason?: string; startsAt?: string | null; provider?: VideoProvider; url?: string; token?: string | null; isHost?: boolean; canModerate?: boolean; role?: VideoRole; waitingStatus?: string; title?: string; kind?: VideoKind; endsAt?: string }

const asKind = (k: unknown): VideoKind => (k === "consulta" ? "consulta" : k === "atividade" ? "atividade" : "reuniao");
const asRole = (r: unknown): VideoRole => (r === "dono" || r === "coanfitriao" || r === "moderador" ? r : "participante");

/** Próximas reuniões que a pessoa pode ver (dona, membro da casa ou cliente convidado). */
export async function fetchUpcoming(): Promise<UpcomingMeeting[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_my_upcoming");
  if (error || !Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id), houseId: String(r.house_id), houseName: String(r.house_name ?? ""), kind: asKind(r.kind),
    title: String(r.title ?? ""), startsAt: String(r.starts_at), durationMin: Number(r.duration_min), isHost: r.is_host === true, role: asRole(r.role), waitingRoom: r.waiting_room === true,
  }));
}

/** Banco de minutos do mês (só a dona da casa e a administração recebem; os demais ficam sem). */
export async function fetchBank(houseId: string): Promise<VideoBank | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("video_bank", { p_house: houseId });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return { cap: Number(d.cap) || 0, used: Number(d.used) || 0, remaining: Number(d.remaining) || 0, enabled: d.enabled === true };
}

export async function scheduleMeeting(a: { houseId: string; kind: VideoKind; title: string; startsAt: string; durationMin: number; max: number; orderId?: string | null; invitees?: string[] | null; waiting?: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Disponível só com conta real." };
  const { error } = await supabase.rpc("video_schedule", { p_house: a.houseId, p_kind: a.kind, p_title: a.title, p_starts_at: a.startsAt, p_duration_min: a.durationMin, p_max_participants: a.max, p_order: a.orderId ?? null, p_invitees: a.invitees && a.invitees.length ? a.invitees : null, p_waiting: a.waiting === true });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface HouseMemberOption { userId: string; name: string; bond: string }
/** Membros ativos da casa com conta (só a dona recebe): a lista de quem pode ser convidado. */
export async function fetchHouseMembers(houseId: string): Promise<HouseMemberOption[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_house_members", { p_house: houseId });
  if (error || !Array.isArray(data)) return [];
  return (data as { user_id: string; name: string; bond: string }[]).map((r) => ({ userId: r.user_id, name: r.name, bond: r.bond ?? "" }));
}

export async function cancelMeeting(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("video_cancel", { p_meeting: id });
  return !error;
}

/** Encerra a reunião em andamento (só a dona da casa): a sala fecha para todos. */
export async function endMeetingNow(id: string): Promise<{ ok: boolean; roomClosed?: boolean }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.functions.invoke("video", { body: { action: "end", meeting_id: id } });
  const d = data as { ok?: boolean; room_closed?: boolean } | null;
  if (error || !d?.ok) return { ok: false };
  return { ok: true, roomClosed: d.room_closed === true };
}

/** A dona retira alguém da sala; a pessoa não volta àquela reunião (o banco nega a entrada). */
export async function removeFromRoom(meetingId: string, userId: string): Promise<{ ok: boolean; kicked?: boolean }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.functions.invoke("video", { body: { action: "remove", meeting_id: meetingId, user_id: userId } });
  const d = data as { ok?: boolean; kicked?: boolean } | null;
  if (error || !d?.ok) return { ok: false };
  return { ok: true, kicked: d.kicked === true };
}

/** Registra a ciência do aviso da sala (a regra de quem pode é a da entrada). */
export async function ackMeeting(id: string, version: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("video_ack", { p_meeting: id, p_version: version });
  return !error;
}

/** A própria pessoa já aceitou o aviso desta reunião, na versão atual dos textos? (sair e voltar à mesma chamada não pede de novo) */
export async function hasAckedMeeting(id: string, version: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("video_acked", { p_meeting: id, p_version: version });
  return !error && data === true;
}

/** Pede a entrada na sala. Quem decide é o servidor (login, vínculo, horário, minutos, lotação). */
export async function joinMeeting(id: string): Promise<JoinResult> {
  if (!supabase) return { ok: false, reason: "sem_login" };
  const { data, error } = await supabase.functions.invoke("video", { body: { action: "join", meeting_id: id } });
  let d = data as Record<string, unknown> | null;
  if (error) {
    try { d = (await (error as { context?: Response }).context?.json()) as Record<string, unknown>; } catch { d = null; }
    if (!d) return { ok: false, reason: "provedor_indisponivel" };
  }
  if (!d || d.ok !== true) return { ok: false, reason: typeof d?.reason === "string" ? d.reason : "indisponivel", startsAt: typeof d?.starts_at === "string" ? d.starts_at : null, waitingStatus: typeof d?.waiting_status === "string" ? d.waiting_status : undefined };
  return { ok: true, provider: d.provider === "livekit" ? "livekit" : "daily", url: String(d.url ?? ""), token: typeof d.token === "string" ? d.token : null, isHost: d.is_host === true, canModerate: d.can_moderate === true || d.is_host === true, role: asRole(d.role), title: String(d.title ?? ""), kind: asKind(d.kind), endsAt: String(d.ends_at ?? "") };
}

/** Pedidos da casa que podem virar consulta por vídeo (só os já pagos e em curso). */
export async function fetchConsultOrders(houseId: string): Promise<{ id: string; title: string; clientName: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("service_orders").select("id, title, status, profiles!service_orders_client_id_fkey(display_name)").eq("house_id", houseId)
    .in("status", ["confirmado", "em_andamento"]).order("created_at", { ascending: false }).limit(50);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: String(r.id), title: String(r.title), clientName: r.profiles?.display_name ? String(r.profiles.display_name) : "Cliente" }));
}

export interface OrderMeeting { id: string; orderId: string; title: string; startsAt: string; durationMin: number }

/** Consultas por vídeo marcadas em cada pedido (a casa vê as suas; o cliente vê as dele; sem nome de sala). */
export async function fetchOrderMeetings(orderIds: string[]): Promise<Map<string, OrderMeeting[]>> {
  const out = new Map<string, OrderMeeting[]>();
  if (!supabase || orderIds.length === 0) return out;
  const { data, error } = await supabase.rpc("video_order_meetings", { p_orders: orderIds.slice(0, 100) });
  if (error || !Array.isArray(data)) return out;
  for (const r of data as Record<string, unknown>[]) {
    const m: OrderMeeting = { id: String(r.meeting_id), orderId: String(r.order_id), title: String(r.title ?? ""), startsAt: String(r.starts_at), durationMin: Number(r.duration_min) };
    out.set(m.orderId, [...(out.get(m.orderId) ?? []), m]);
  }
  return out;
}

/** A casa tem o vídeo liberado e minutos no plano? (decide se o pedido mostra "Marcar consulta por vídeo"). */
export async function houseVideoReady(houseId: string): Promise<boolean> {
  const b = await fetchBank(houseId);
  return Boolean(b?.enabled && b.cap > 0);
}

export async function fetchVideoConfig(): Promise<VideoConfig> {
  if (!supabase) return readVideoConfig(null);
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "video").maybeSingle();
  return readVideoConfig(data?.value);
}

export async function saveVideoConfig(cfg: VideoConfig): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("admin_set_setting", { p_key: "video", p_value: cfg });
  return !error;
}

export async function setupDailyWebhook(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "sem_conexao" };
  const { data, error } = await supabase.functions.invoke("video", { body: { action: "setup_daily_webhook" } });
  if (error) return { ok: false, error: "Não consegui cadastrar. Veja os registros da função." };
  return (data as { ok?: boolean })?.ok ? { ok: true } : { ok: false, error: "O Daily recusou o cadastro." };
}

/** Mostra "Reuniões" no menu só para quem tem reunião marcada ou, sendo casa, já tem o vídeo liberado. */
export function useVideoNav(userId: string | undefined, isHouse: boolean): boolean {
  const [state, setState] = useState<{ id?: string; on: boolean }>({ on: false });
  useEffect(() => {
    if (!userId || !supabase) return;
    let alive = true;
    void (async () => {
      const up = await fetchUpcoming();
      let on = up.length > 0;
      if (!on && isHouse) {
        const { data } = await supabase!.from("houses").select("id").eq("owner_id", userId).maybeSingle();
        const b = data?.id ? await fetchBank(String(data.id)) : null;
        on = Boolean(b?.enabled && b.cap > 0);
      }
      if (alive) setState({ id: userId, on });
    })();
    return () => { alive = false; };
  }, [userId, isHouse]);
  return state.id === userId && state.on;
}

// ---------- Vídeo 2.0: sala de espera, anfitriões e presença ----------

/** Pede a entrada: se a sala tem espera, a pessoa entra na fila; devolve o estado (a tela repete o pedido até liberar). */
export async function requestEntry(id: string): Promise<{ ok: boolean; reason?: string; startsAt?: string | null }> {
  if (!supabase) return { ok: false, reason: "sem_login" };
  const { data, error } = await supabase.rpc("video_request_entry", { p_meeting: id });
  const d = data as Record<string, unknown> | null;
  if (error || !d) return { ok: false, reason: "indisponivel" };
  return { ok: d.ok === true, reason: typeof d.reason === "string" ? d.reason : undefined, startsAt: typeof d.starts_at === "string" ? d.starts_at : null };
}

export interface WaitingPerson { userId: string; name: string; requestedAt: string }
export async function fetchWaiting(id: string): Promise<WaitingPerson[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_waiting_list", { p_meeting: id });
  if (error || !Array.isArray(data)) return [];
  return (data as { user_id: string; name: string; requested_at: string }[]).map((r) => ({ userId: r.user_id, name: r.name, requestedAt: r.requested_at }));
}

/** Admite ou nega uma pessoa, várias ou todas as que esperam. Devolve quantas decisões valeram (ou -1 se falhou). */
export async function decideWaiting(id: string, decision: "admitir" | "negar", users: string[] | null, all = false): Promise<number> {
  if (!supabase) return -1;
  const { data, error } = await supabase.rpc("video_admit", { p_meeting: id, p_users: users, p_decision: decision, p_all: all });
  return error || typeof data !== "number" ? -1 : data;
}

export interface Helper { userId: string; name: string; role: "coanfitriao" | "moderador" }
export async function fetchHelpers(id: string): Promise<Helper[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_helpers_of", { p_meeting: id });
  if (error || !Array.isArray(data)) return [];
  return (data as { user_id: string; name: string; role: string }[]).map((r) => ({ userId: r.user_id, name: r.name, role: r.role === "coanfitriao" ? "coanfitriao" : "moderador" }));
}
/** Indica (ou, com role nulo, tira) um ajudante da reunião. */
export async function setHelper(id: string, userId: string, role: "coanfitriao" | "moderador" | null): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Disponível só com conta real." };
  const { error } = await supabase.rpc("video_set_helper", { p_meeting: id, p_user: userId, p_role: role });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface PresenceRow { userId: string; name: string; role: VideoRole; expected: boolean; firstIn: string | null; lastOut: string | null; minutes: number; sessions: number; removed: boolean; waited: string | null }
export async function fetchPresence(id: string): Promise<PresenceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_presence", { p_meeting: id });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({ userId: String(r.user_id), name: String(r.name ?? "Participante"), role: asRole(r.role), expected: r.expected === true, firstIn: typeof r.first_in === "string" ? r.first_in : null,
    lastOut: typeof r.last_out === "string" ? r.last_out : null, minutes: Number(r.minutes) || 0, sessions: Number(r.sessions) || 0, removed: r.removed === true, waited: typeof r.waited === "string" ? r.waited : null }));
}

export interface HistoryRow { id: string; title: string; kind: VideoKind; startsAt: string; durationMin: number; status: string; expected: number; present: number; minutes: number }
export async function fetchHistory(houseId: string): Promise<HistoryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_history", { p_house: houseId });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({ id: String(r.id), title: String(r.title ?? ""), kind: asKind(r.kind), startsAt: String(r.starts_at), durationMin: Number(r.duration_min), status: String(r.status ?? ""),
    expected: Number(r.expected) || 0, present: Number(r.present) || 0, minutes: Number(r.minutes) || 0 }));
}

/** Abre a sala de vídeo da plataforma para um ritual à distância (a atividade ao vivo vendida como ingresso). */
export async function openActivityRoom(eventId: string, durationMin?: number): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!supabase) return { ok: false, error: "Disponível só com conta real." };
  const { data, error } = await supabase.rpc("video_schedule_activity", { p_event: eventId, p_duration_min: durationMin ?? null });
  return error ? { ok: false, error: error.message } : { ok: true, id: String(data) };
}

/** A sala de vídeo aberta de um ritual (para o comprador entrar e a casa gerir), ou null. */
export async function fetchActivityRoom(eventId: string): Promise<{ id: string; startsAt: string; durationMin: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("video_activity_of", { p_event: eventId });
  const r = Array.isArray(data) ? data[0] : null;
  if (error || !r) return null;
  return { id: String(r.id), startsAt: String(r.starts_at), durationMin: Number(r.duration_min) };
}
