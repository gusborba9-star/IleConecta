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
      const props = { exp: sec(w.closes), nbf: sec(w.opens), max_participants: Math.min(Math.max(Number(maxParticipants) || 2, 2), 100), enable_prejoin_ui: true, enable_knocking: false, eject_at_room_exp: true, lang: "pt-BR" };
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
    /** Fecha a sala para todos (quem está dentro é retirado). Sala que já não existe conta como fechada. */
    async closeRoom({ roomName }) {
      const res = await fetchImpl(`${base}/rooms/${encodeURIComponent(roomName)}`, { method: "DELETE", headers });
      return res.ok || res.status === 404;
    },
  };
}


const b64url = (buf) => bytesToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o) => b64url(te.encode(JSON.stringify(o)));
const fromB64url = (t) => { const p = t.replace(/-/g, "+").replace(/_/g, "/"); return atob(p + "=".repeat((4 - (p.length % 4)) % 4)); };

/** JWT HS256 assinado com o segredo da LiveKit (usado nas entradas, nas ordens ao servidor e na conferência dos avisos). */
export async function signLivekitJwt(apiKey, apiSecret, claims) {
  const head = b64urlJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlJson({ iss: apiKey, ...claims });
  const sig = b64url(await hmac(te.encode(apiSecret), `${head}.${payload}`));
  return `${head}.${payload}.${sig}`;
}

/** LiveKit: o aviso traz no cabeçalho Authorization um JWT assinado com a mesma chave/segredo, com o sha256 (base64) do corpo. */
export async function verifyLivekitWebhook({ apiKey, apiSecret, authorization, rawBody, nowMs = Date.now() }) {
  try {
    if (!apiKey || !apiSecret || !authorization || typeof rawBody !== "string") return false;
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const expected = b64url(await hmac(te.encode(apiSecret), `${parts[0]}.${parts[1]}`));
    if (!safeEqual(expected, parts[2])) return false;
    const head = JSON.parse(fromB64url(parts[0]));
    if (head.alg !== "HS256") return false;
    const c = JSON.parse(fromB64url(parts[1]));
    if (c.iss !== apiKey) return false;
    const nowS = nowMs / 1000;
    if (typeof c.exp === "number" && nowS > c.exp + 60) return false;
    if (typeof c.nbf === "number" && nowS < c.nbf - 60) return false;
    const digest = bytesToB64(await crypto.subtle.digest("SHA-256", te.encode(rawBody)));
    return safeEqual(digest, String(c.sha256 ?? ""));
  } catch { return false; }
}

/** LiveKit: sala por reunião; quem entra recebe um token curto (identidade = id da pessoa). A tela é nossa (não há iframe). */
export function livekitAdapter(fetchImpl, { url, apiKey, apiSecret }) {
  const host = String(url ?? "").replace(/^wss:/i, "https:").replace(/^ws:/i, "http:").replace(/\/+$/, "");
  const wss = host.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  const admin = (room) => signLivekitJwt(apiKey, apiSecret, { sub: "ile-conecta", nbf: sec(Date.now()) - 10, exp: sec(Date.now()) + 300, video: { roomCreate: true, roomAdmin: true, roomList: true, room } });
  const twirp = async (method, body, room) => fetchImpl(`${host}/twirp/livekit.RoomService/${method}`, { method: "POST", headers: { Authorization: `Bearer ${await admin(room)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    name: "livekit",
    async ensureRoom({ roomName, startsAt, durationMin, maxParticipants }) {
      const w = roomWindow(startsAt, durationMin);
      const res = await twirp("CreateRoom", { name: roomName, max_participants: Math.min(Math.max(Number(maxParticipants) || 2, 2), 100), empty_timeout: 600, departure_timeout: 20 }, roomName);
      if (!res.ok) throw new Error("provedor_indisponivel");
      void w;
      return { ref: roomName, url: wss, hostUrl: null };
    },
    async accessFor({ room, roomName, userId, displayName, isHost, startsAt, durationMin }) {
      const w = roomWindow(startsAt, durationMin);
      const now = Date.now();
      const exp = sec(Math.max(w.closes, now + 5 * 60_000));
      const token = await signLivekitJwt(apiKey, apiSecret, {
        sub: String(userId ?? "").slice(0, 36) || "convidado", name: String(displayName ?? "Participante").slice(0, 40), nbf: sec(now) - 10, exp,
        video: { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
        metadata: JSON.stringify({ host: Boolean(isHost) }),
      });
      return { url: room.url || wss, token };
    },
    /** Fecha a sala para todos (quem está dentro é retirado). Sala que já não existe conta como fechada. */
    async closeRoom({ roomName }) {
      const res = await twirp("DeleteRoom", { room: roomName }, roomName);
      return res.ok || res.status === 404;
    },
  };
}

export function adapterFor(provider, fetchImpl, keys) {
  if (provider === "daily" && keys.daily) return dailyAdapter(fetchImpl, keys.daily);
  if (provider === "livekit" && keys.livekit?.url && keys.livekit?.apiKey && keys.livekit?.apiSecret) return livekitAdapter(fetchImpl, keys.livekit);
  return null;
}

/** LiveKit → mesmo formato do Daily. participant_joined/left/room_finished. */
export function normalizeLivekitEvent(evt) {
  const type = evt?.event;
  const room = evt?.room?.name;
  const p = evt?.participant ?? {};
  const evAt = toMs(evt?.createdAt) ?? Date.now();
  const id = typeof p.identity === "string" && /^[0-9a-f-]{36}$/i.test(p.identity) ? p.identity : null;
  const joinedAt = toMs(Number(p.joinedAt)) ?? null;
  if (type === "participant_joined" && room && p.sid) return { kind: "joined", room: String(room), session: String(p.sid), userId: id, at: joinedAt ?? evAt, joinedAt: joinedAt ?? evAt };
  if (type === "participant_left" && room && p.sid) return { kind: "left", room: String(room), session: String(p.sid), userId: id, at: evAt, joinedAt: joinedAt ?? evAt };
  if (type === "room_finished" && room) return { kind: "ended", room: String(room), at: evAt };
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

/**
 * Encerrar reunião (só a dona da casa; o banco confere): marca como encerrada, fecha a sala no provedor e fecha os minutos em uso.
 * deps: { endMeeting(id) -> { provider, room_name, provider_ref }, adapterFor(provider), closeUsage(room) }
 * Mesmo que o provedor falhe, a reunião já está encerrada no banco (ninguém novo entra); a falha é devolvida para o aviso.
 */
export async function endMeeting(meetingId, deps) {
  if (typeof meetingId !== "string" || !/^[0-9a-f-]{36}$/i.test(meetingId)) return { ok: false, reason: "pedido_invalido" };
  let info;
  try { info = await deps.endMeeting(meetingId); } catch (e) { return { ok: false, reason: "recusado", message: String(e?.message ?? "") }; }
  if (!info) return { ok: false, reason: "recusado" };
  let roomClosed = false;
  try {
    const adapter = deps.adapterFor(info.provider);
    if (adapter && typeof adapter.closeRoom === "function") roomClosed = await adapter.closeRoom({ roomName: info.room_name, ref: info.provider_ref });
  } catch { roomClosed = false; }
  try { await deps.closeUsage(info.room_name); } catch { /* o aviso do provedor e a limpeza fecham depois */ }
  return { ok: true, room_closed: roomClosed };
}
