// Regras puras da função de vídeo (sem rede nem Deno): adaptadores dos provedores, assinaturas dos avisos e leitura dos eventos.
// O provedor ativo é escolhido no painel (platform_settings.video.provider) e gravado em cada reunião: trocar vale só para as próximas.

const te = new TextEncoder();
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, te.encode(message));
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Daily: HMAC-SHA256 de "timestamp.corpo", com a chave decodificada de base64, comparado em base64. Aceita 5 minutos de diferença. */
export async function verifyDailySignature({ secretB64, timestamp, signature, rawBody, nowMs = Date.now() }) {
  try {
    if (!secretB64 || !timestamp || !signature || typeof rawBody !== "string") return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const tsMs = ts < 1e12 ? ts * 1000 : ts;
    if (Math.abs(nowMs - tsMs) > 5 * 60_000) return false;
    const sig = bytesToB64(await hmac(b64ToBytes(secretB64), `${timestamp}.${rawBody}`));
    return safeEqual(sig, signature);
  } catch { return false; }
}

/** Whereby: cabeçalho "t=<tempo>,v1=<assinatura>"; HMAC-SHA256 de "tempo.corpo" com o segredo do endpoint. Aceita 5 minutos de diferença. */
export async function verifyWherebySignature({ secret, header, rawBody, nowMs = Date.now() }) {
  try {
    if (!secret || !header || typeof rawBody !== "string") return false;
    const parts = Object.fromEntries(String(header).split(",").map((p) => p.trim().split("=")).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join("=")]));
    const t = parts.t, v1 = parts.v1;
    if (!t || !v1) return false;
    const tsMs = Number(t) < 1e12 ? Number(t) * 1000 : Number(t);
    if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > 5 * 60_000) return false;
    const mine = bytesToHex(await hmac(te.encode(secret), `${t}.${rawBody}`));
    return safeEqual(mine, v1.toLowerCase());
  } catch { return false; }
}

const iso = (ms) => new Date(ms).toISOString();
const sec = (ms) => Math.floor(ms / 1000);

/** Janela da sala: abre 10 min antes do início e fecha 15 min depois do fim previsto. */
export function roomWindow(startsAtIso, durationMin) {
  const start = Date.parse(startsAtIso);
  if (!Number.isFinite(start)) throw new Error("horario_invalido");
  const dur = Number(durationMin);
  if (!Number.isInteger(dur) || dur < 5 || dur > 90) throw new Error("duracao_invalida");
  const opens = start - 10 * 60_000, endsAt = start + dur * 60_000, closes = endsAt + 15 * 60_000;
  return { opens, endsAt, closes };
}

const j = async (res) => { try { return await res.json(); } catch { return {}; } };

/** Daily: sala privada (só entra com token), validade, lotação, expulsão ao fim, servidor em São Paulo. */
export function dailyAdapter(fetchImpl, apiKey, base = "https://api.daily.co/v1") {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    name: "daily",
    async ensureRoom({ roomName, startsAt, durationMin, maxParticipants }) {
      const w = roomWindow(startsAt, durationMin);
      const props = { exp: sec(w.closes), nbf: sec(w.opens), max_participants: Math.min(Math.max(Number(maxParticipants) || 2, 2), 100), enable_prejoin_ui: true, enable_knocking: false, eject_at_room_exp: true };
      const make = (withGeo) => fetchImpl(`${base}/rooms`, { method: "POST", headers, body: JSON.stringify({ name: roomName, privacy: "private", properties: withGeo ? { ...props, geo: "sa-east-1" } : props }) });
      let res = await make(true);
      if (res.status === 400) {
        const body = await j(res.clone ? res.clone() : res);
        const text = JSON.stringify(body).toLowerCase();
        if (text.includes("already exists")) {
          const got = await fetchImpl(`${base}/rooms/${encodeURIComponent(roomName)}`, { headers });
          if (!got.ok) throw new Error("provedor_indisponivel");
          const g = await j(got);
          return { ref: roomName, url: g.url, hostUrl: null };
        }
        if (text.includes("geo")) res = await make(false);
      }
      if (!res.ok) throw new Error("provedor_indisponivel");
      const d = await j(res);
      if (!d.url) throw new Error("provedor_resposta_invalida");
      return { ref: roomName, url: d.url, hostUrl: null };
    },
    async accessFor({ room, roomName, userId, displayName, isHost, startsAt, durationMin }) {
      const w = roomWindow(startsAt, durationMin);
      const res = await fetchImpl(`${base}/meeting-tokens`, { method: "POST", headers, body: JSON.stringify({ properties: {
        room_name: roomName, exp: sec(w.closes), user_name: String(displayName ?? "Participante").slice(0, 40), user_id: String(userId ?? "").slice(0, 36) || undefined,
        is_owner: Boolean(isHost), eject_at_token_exp: true } }) });
      if (!res.ok) throw new Error("provedor_indisponivel");
      const d = await j(res);
      if (!d.token) throw new Error("provedor_resposta_invalida");
      return { url: room.url, token: d.token };
    },
  };
}

/** Whereby Embedded: reunião passageira (some sozinha depois do fim); anfitrião usa o endereço de anfitrião. */
export function wherebyAdapter(fetchImpl, apiKey, base = "https://api.whereby.dev/v1") {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    name: "whereby",
    async ensureRoom({ startsAt, durationMin }) {
      const w = roomWindow(startsAt, durationMin);
      const res = await fetchImpl(`${base}/meetings`, { method: "POST", headers, body: JSON.stringify({ endDate: iso(w.closes), roomNamePrefix: "ic", roomMode: "group", fields: ["hostRoomUrl"] }) });
      if (!res.ok) throw new Error("provedor_indisponivel");
      const d = await j(res);
      if (!d.meetingId || !d.roomUrl) throw new Error("provedor_resposta_invalida");
      return { ref: String(d.meetingId), url: d.roomUrl, hostUrl: d.hostRoomUrl ?? null };
    },
    async accessFor({ room, displayName, isHost }) {
      const base0 = isHost && room.hostUrl ? room.hostUrl : room.url;
      const u = new URL(base0);
      u.searchParams.set("embed", "");
      u.searchParams.set("displayName", String(displayName ?? "Participante").replace(/[$!<>:;]/g, "").slice(0, 40) || "Participante");
      return { url: u.toString().replace("embed=", "embed") };
    },
  };
}

export function adapterFor(provider, fetchImpl, keys) {
  if (provider === "daily" && keys.daily) return dailyAdapter(fetchImpl, keys.daily);
  if (provider === "whereby" && keys.whereby) return wherebyAdapter(fetchImpl, keys.whereby);
  return null;
}

/**
 * Entrada: confere acesso (o banco decide), cria a sala só na primeira vez e devolve o que a tela precisa.
 * deps: { joinCheck(meetingId), roomGet(meetingId), roomSet(meetingId, ref, url, hostUrl), meteringReady(provider), adapter }
 */
export async function joinMeeting(meetingId, deps) {
  if (typeof meetingId !== "string" || !/^[0-9a-f-]{36}$/i.test(meetingId)) return { ok: false, reason: "pedido_invalido" };
  const chk = await deps.joinCheck(meetingId);
  if (!chk || chk.ok !== true) return { ok: false, reason: chk?.reason ?? "indisponivel", starts_at: chk?.starts_at ?? null };
  if (!deps.adapter || deps.adapter.name !== chk.provider) return { ok: false, reason: "provedor_indisponivel" };
  // Sem o aviso de entrada/saída do provedor os minutos não seriam medidos (consumo sem cobrança do banco): nesse caso a sala não abre.
  if (typeof deps.meteringReady !== "function" || !(await deps.meteringReady(chk.provider))) return { ok: false, reason: "medicao_indisponivel" };
  let room = await deps.roomGet(meetingId);
  if (!room?.ref || !room?.url) {
    const made = await deps.adapter.ensureRoom({ roomName: chk.room_name, startsAt: chk.starts_at, durationMin: chk.duration_min, maxParticipants: chk.max_participants });
    room = (await deps.roomSet(meetingId, made.ref, made.url, made.hostUrl)) ?? { ref: made.ref, url: made.url, host_url: made.hostUrl };
  }
  const access = await deps.adapter.accessFor({
    room: { url: room.url, hostUrl: room.host_url ?? null }, roomName: chk.room_name, userId: chk.user_id, displayName: chk.display_name,
    isHost: chk.is_host, startsAt: chk.starts_at, durationMin: chk.duration_min,
  });
  return { ok: true, provider: chk.provider, url: access.url, token: access.token ?? null, is_host: chk.is_host, title: chk.title, kind: chk.kind, ends_at: chk.ends_at };
}

const toMs = (v) => (typeof v === "number" && Number.isFinite(v) ? (v < 1e12 ? Math.round(v * 1000) : v) : typeof v === "string" && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);

/** Daily → { kind: "joined" | "left" | "ended", room, session, userId, at, joinedAt } ou null. O formato exato é conferido no teste real (ver diagnóstico no index). */
export function normalizeDailyEvent(evt) {
  const p = evt?.payload ?? {};
  const type = evt?.type;
  const evAt = toMs(evt?.event_ts) ?? toMs(evt?.event_time) ?? Date.now();
  const uid = typeof p.user_id === "string" && /^[0-9a-f-]{36}$/i.test(p.user_id) ? p.user_id : null;
  if (type === "participant.joined" && p.room && p.session_id) return { kind: "joined", room: String(p.room), session: String(p.session_id), userId: uid, at: toMs(p.joined_at) ?? evAt, joinedAt: toMs(p.joined_at) ?? evAt };
  if (type === "participant.left" && p.room && p.session_id) {
    const joinedAt = toMs(p.joined_at);
    const dur = typeof p.duration === "number" ? p.duration * 1000 : null;
    const at = evAt;
    return { kind: "left", room: String(p.room), session: String(p.session_id), userId: uid, at, joinedAt: joinedAt ?? (dur !== null ? at - dur : at) };
  }
  if (type === "meeting.ended" && p.room) return { kind: "ended", room: String(p.room), at: evAt };
  return null;
}

/** Whereby → mesmo formato. O código da reunião (meetingId) identifica a sala; o tempo vem do createdAt do aviso. */
export function normalizeWherebyEvent(evt) {
  const d = evt?.data ?? {};
  const at = toMs(evt?.createdAt) ?? Date.now();
  const ext = typeof d.externalId === "string" && /^[0-9a-f-]{36}$/i.test(d.externalId) ? d.externalId : null;
  const session = d.participantId ? String(d.participantId) : null;
  if (evt?.type === "room.client.joined" && d.meetingId && session) return { kind: "joined", room: String(d.meetingId), session, userId: ext, at, joinedAt: at };
  if (evt?.type === "room.client.left" && d.meetingId && session) return { kind: "left", room: String(d.meetingId), session, userId: ext, at, joinedAt: null };
  return null;
}
