import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readVideoConfig, type VideoConfig, type VideoKind } from "@/lib/videoCore";

export interface UpcomingMeeting { id: string; houseId: string; houseName: string; kind: VideoKind; title: string; startsAt: string; durationMin: number; isHost: boolean }
export interface VideoBank { cap: number; used: number; remaining: number; enabled: boolean }
export interface JoinResult { ok: boolean; reason?: string; startsAt?: string | null; provider?: "daily" | "whereby"; url?: string; token?: string | null; isHost?: boolean; title?: string; kind?: VideoKind; endsAt?: string }

/** Próximas reuniões que a pessoa pode ver (dona, membro da casa ou cliente convidado). */
export async function fetchUpcoming(): Promise<UpcomingMeeting[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("video_my_upcoming");
  if (error || !Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id), houseId: String(r.house_id), houseName: String(r.house_name ?? ""), kind: r.kind === "consulta" ? "consulta" : "reuniao",
    title: String(r.title ?? ""), startsAt: String(r.starts_at), durationMin: Number(r.duration_min), isHost: r.is_host === true,
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

export async function scheduleMeeting(a: { houseId: string; kind: VideoKind; title: string; startsAt: string; durationMin: number; max: number; orderId?: string | null }): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Disponível só com conta real." };
  const { error } = await supabase.rpc("video_schedule", { p_house: a.houseId, p_kind: a.kind, p_title: a.title, p_starts_at: a.startsAt, p_duration_min: a.durationMin, p_max_participants: a.max, p_order: a.orderId ?? null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function cancelMeeting(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("video_cancel", { p_meeting: id });
  return !error;
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
  if (!d || d.ok !== true) return { ok: false, reason: typeof d?.reason === "string" ? d.reason : "indisponivel", startsAt: typeof d?.starts_at === "string" ? d.starts_at : null };
  return { ok: true, provider: d.provider === "whereby" ? "whereby" : "daily", url: String(d.url ?? ""), token: typeof d.token === "string" ? d.token : null, isHost: d.is_host === true, title: String(d.title ?? ""), kind: d.kind === "consulta" ? "consulta" : "reuniao", endsAt: String(d.ends_at ?? "") };
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
