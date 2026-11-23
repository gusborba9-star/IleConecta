// Função de borda: vídeo das casas (reuniões com membros e consultas). Os dois provedores (Daily e Whereby Embedded) ficam atrás do mesmo contrato;
// o painel escolhe o ativo e cada reunião guarda o provedor que a criou. As chaves vêm dos segredos DAILY_API_KEY e WHEREBY_API_KEY.
// Quem entra é sempre identificado pelo JWT e o BANCO decide o acesso (video_join_check). Os avisos dos provedores entram por ?hook=daily|whereby
// e só valem com assinatura correta; só eles gravam consumo de minutos.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adapterFor, joinMeeting, normalizeDailyEvent, normalizeWherebyEvent, verifyDailySignature, verifyWherebySignature } from "./core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo_nao_permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const keys = { daily: Deno.env.get("DAILY_API_KEY") ?? "", whereby: Deno.env.get("WHEREBY_API_KEY") ?? "" };
  const hook = new URL(req.url).searchParams.get("hook");

  // ---- avisos dos provedores (sem login: valem pela assinatura) ----
  if (hook === "daily" || hook === "whereby") {
    const raw = await req.text();
    let evt: unknown;
    let ok = false;
    if (hook === "daily") {
      const { data } = await admin.from("app_secrets").select("value").eq("key", "daily_webhook_hmac").maybeSingle();
      const secret = (data?.value as string | undefined) ?? Deno.env.get("DAILY_WEBHOOK_HMAC") ?? "";
      ok = await verifyDailySignature({ secretB64: secret, timestamp: req.headers.get("x-webhook-timestamp") ?? "", signature: req.headers.get("x-webhook-signature") ?? "", rawBody: raw });
    } else {
      ok = await verifyWherebySignature({ secret: Deno.env.get("WHEREBY_WEBHOOK_SECRET") ?? "", header: req.headers.get("whereby-signature") ?? "", rawBody: raw });
    }
    if (!ok) return json(401, { error: "assinatura_invalida" });
    try { evt = JSON.parse(raw); } catch { return json(200, { ok: true, ignorado: "json" }); }
    const n = hook === "daily" ? normalizeDailyEvent(evt) : normalizeWherebyEvent(evt);
    if (!n) {
      const e = evt as { type?: unknown; payload?: unknown; data?: unknown };
      console.error("video_hook_ignorado", hook, String(e?.type ?? "?").slice(0, 60), Object.keys((e?.payload ?? e?.data ?? {}) as object).slice(0, 20).join(","));
      return json(200, { ok: true, ignorado: "tipo" });
    }
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
    const { error } = n.kind === "ended"
      ? await admin.rpc("video_close_room", { p_room: n.room })
      : await admin.rpc("video_record_usage", { p_room: n.room, p_session: n.session, p_user: n.userId, p_joined: iso(n.joinedAt), p_left: n.kind === "left" ? iso(n.at) : null });
    if (error) { console.error("video_hook_erro", error.message); return json(500, { error: "falha_ao_registrar" }); }
    return json(200, { ok: true });
  }

  // ---- ações da pessoa logada ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth?.user) return json(401, { error: "nao_autenticado" });

  let body: { action?: unknown; meeting_id?: unknown } = {};
  try { body = await req.json(); } catch { return json(400, { error: "json_invalido" }); }

  if (body.action === "join") {
    try {
      const meetingId = String(body.meeting_id ?? "");
      // o provedor vem da reunião (gravado ao marcar), não do painel: trocar no painel vale só para as próximas
      const { data: meta } = await admin.from("video_meetings").select("provider").eq("id", meetingId).maybeSingle();
      const adapter = adapterFor((meta?.provider as string | undefined) ?? "", fetch, keys);
      const result = await joinMeeting(meetingId, {
        joinCheck: async (id: string) => {
          const { data, error } = await asUser.rpc("video_join_check", { p_meeting: id });
          if (error) throw new Error(error.message);
          return data;
        },
        roomGet: async (id: string) => (await admin.rpc("video_room_get", { p_meeting: id })).data,
        roomSet: async (id: string, ref: string, u: string, host: string | null) => {
          const { data, error } = await admin.rpc("video_set_room", { p_meeting: id, p_ref: ref, p_url: u, p_host_url: host });
          if (error) throw new Error(error.message);
          return data;
        },
        adapter,
      });
      return json(result.ok ? 200 : 403, result as unknown as Record<string, unknown>);
    } catch (e) {
      console.error("video_join", (e as Error).message);
      return json(502, { ok: false, reason: "provedor_indisponivel" });
    }
  }

  // Cadastra o aviso de entrada/saída do Daily (uma vez, pela administração). A chave de assinatura fica guardada só no servidor.
  if (body.action === "setup_daily_webhook") {
    const { data: can } = await asUser.rpc("admin_can", { p_module: "dono" });
    if (!can) return json(403, { error: "sem_permissao" });
    if (!keys.daily) return json(503, { error: "daily_sem_chave" });
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const hmac = btoa(String.fromCharCode(...bytes));
    const { error: se } = await admin.from("app_secrets").upsert({ key: "daily_webhook_hmac", value: hmac });
    if (se) return json(500, { error: "falha_ao_guardar" });
    const res = await fetch("https://api.daily.co/v1/webhooks", {
      method: "POST", headers: { Authorization: `Bearer ${keys.daily}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${url}/functions/v1/video?hook=daily`, eventTypes: ["participant.joined", "participant.left", "meeting.ended"], hmac, retryType: "exponential" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("video_setup_webhook", res.status, JSON.stringify(out).slice(0, 300)); return json(502, { error: "daily_recusou", status: res.status }); }
    return json(200, { ok: true, uuid: (out as { uuid?: string }).uuid ?? null });
  }

  return json(400, { error: "acao_invalida" });
});
