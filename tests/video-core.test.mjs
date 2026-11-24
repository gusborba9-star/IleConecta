import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { adapterFor, dailyAdapter, endMeeting, joinMeeting, livekitAdapter, normalizeDailyEvent, normalizeLivekitEvent, roomWindow, signLivekitJwt, verifyDailySignature, verifyLivekitWebhook } from "../supabase/functions/video/core.js";

const UID = "11111111-1111-4111-8111-111111111111";
const MID = "22222222-2222-4222-8222-222222222222";
const B64 = (u8) => Buffer.from(u8).toString("base64");
async function hm(keyBytes, msg) {
  const k = await webcrypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await webcrypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, clone() { return res(status, body); } });
const START = "2026-12-01T18:00:00.000Z";

test("janela da sala: abre 10 min antes, fecha 15 min depois do fim", () => {
  const w = roomWindow(START, 60);
  assert.equal(Date.parse(START) - w.opens, 10 * 60_000);
  assert.equal(w.closes - w.endsAt, 15 * 60_000);
  assert.throws(() => roomWindow(START, 4));
  assert.throws(() => roomWindow(START, 91));
  assert.throws(() => roomWindow("x", 30));
});

test("assinatura do Daily: certa passa; corpo, chave e hora erradas falham", async () => {
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const now = Date.now(), ts = String(Math.floor(now / 1000)), body = '{"a":1}';
  const sig = B64(await hm(key, `${ts}.${body}`));
  assert.equal(await verifyDailySignature({ secretB64: B64(key), timestamp: ts, signature: sig, rawBody: body, nowMs: now }), true);
  assert.equal(await verifyDailySignature({ secretB64: B64(key), timestamp: ts, signature: sig, rawBody: body + " ", nowMs: now }), false);
  assert.equal(await verifyDailySignature({ secretB64: B64(webcrypto.getRandomValues(new Uint8Array(32))), timestamp: ts, signature: sig, rawBody: body, nowMs: now }), false);
  assert.equal(await verifyDailySignature({ secretB64: B64(key), timestamp: ts, signature: sig, rawBody: body, nowMs: now + 10 * 60_000 }), false);
  assert.equal(await verifyDailySignature({ secretB64: "", timestamp: ts, signature: sig, rawBody: body, nowMs: now }), false);
});

test("Daily: cria sala privada com validade e lotação; trata sala já existente e geo recusado", async () => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return res(200, { url: "https://x.daily.co/ic-1" }); };
  const a = dailyAdapter(f, "KEY");
  const r = await a.ensureRoom({ roomName: "ic-1", startsAt: START, durationMin: 60, maxParticipants: 50 });
  assert.deepEqual(r, { ref: "ic-1", url: "https://x.daily.co/ic-1", hostUrl: null });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.privacy, "private");
  assert.equal(sent.properties.max_participants, 50);
  assert.equal(sent.properties.geo, "sa-east-1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer KEY");

  let n = 0;
  const f2 = async (url) => (n++ === 0 ? res(400, { info: "a room named ic-1 already exists" }) : res(200, { url: "https://x.daily.co/ic-1" }));
  assert.equal((await dailyAdapter(f2, "K").ensureRoom({ roomName: "ic-1", startsAt: START, durationMin: 30, maxParticipants: 2 })).url, "https://x.daily.co/ic-1");

  const seen = [];
  const f3 = async (url, init) => { const b = JSON.parse(init.body); seen.push(Boolean(b.properties.geo)); return seen.length === 1 ? res(400, { info: "invalid geo" }) : res(200, { url: "u" }); };
  await dailyAdapter(f3, "K").ensureRoom({ roomName: "ic-2", startsAt: START, durationMin: 30, maxParticipants: 2 });
  assert.deepEqual(seen, [true, false]);

  await assert.rejects(() => dailyAdapter(async () => res(500, {}), "K").ensureRoom({ roomName: "r", startsAt: START, durationMin: 30, maxParticipants: 2 }), /provedor_indisponivel/);
});

test("Daily: token de acesso leva nome, dono e expira com a sala", async () => {
  let sent;
  const a = dailyAdapter(async (u, init) => { sent = JSON.parse(init.body); return res(200, { token: "TKN" }); }, "K");
  const out = await a.accessFor({ room: { url: "https://x.daily.co/r" }, roomName: "r", userId: UID, displayName: "Maria", isHost: true, startsAt: START, durationMin: 60 });
  assert.deepEqual(out, { url: "https://x.daily.co/r", token: "TKN" });
  assert.equal(sent.properties.is_owner, true);
  assert.equal(sent.properties.room_name, "r");
  assert.equal(sent.properties.exp, Math.floor((Date.parse(START) + 75 * 60_000) / 1000));
  assert.ok(sent.properties.user_id.length <= 36);
});

test("adapterFor só entrega o provedor com chave", () => {
  assert.equal(adapterFor("daily", fetch, { daily: "k" }).name, "daily");
  assert.equal(adapterFor("daily", fetch, { daily: "" }), null);
  assert.equal(adapterFor("whereby", fetch, { daily: "k", whereby: "k" }), null);
  assert.equal(adapterFor("outro", fetch, { daily: "k" }), null);
});

function deps(over = {}) {
  const state = { room: null, created: 0 };
  return { state, d: {
    joinCheck: async () => ({ ok: true, room_name: "ic-1", provider: "daily", is_host: false, display_name: "Ana", user_id: UID, kind: "reuniao", title: "Encontro", starts_at: START, duration_min: 60, max_participants: 50, ends_at: START }),
    meteringReady: async () => true,
    roomGet: async () => state.room,
    roomSet: async (id, ref, url, host) => { if (!state.room) state.room = { ref, url, host_url: host }; return state.room; },
    adapter: { name: "daily", ensureRoom: async () => { state.created++; return { ref: "ic-1", url: "https://x.daily.co/ic-1", hostUrl: null }; }, accessFor: async ({ room }) => ({ url: room.url, token: "T" }) },
    ...over } };
}

test("entrada: cria a sala só na primeira vez", async () => {
  const { state, d } = deps();
  const a = await joinMeeting(MID, d);
  const b = await joinMeeting(MID, d);
  assert.equal(a.ok, true); assert.equal(a.token, "T"); assert.equal(b.ok, true);
  assert.equal(state.created, 1);
});

test("entrada: negada pelo banco não toca no provedor; pedido inválido e provedor ausente", async () => {
  const { state, d } = deps({ joinCheck: async () => ({ ok: false, reason: "sem_minutos" }) });
  assert.deepEqual(await joinMeeting(MID, d), { ok: false, reason: "sem_minutos", starts_at: null });
  assert.equal(state.created, 0);
  assert.equal((await joinMeeting("abc", deps().d)).reason, "pedido_invalido");
  assert.equal((await joinMeeting(MID, deps({ adapter: null }).d)).reason, "provedor_indisponivel");
  assert.equal((await joinMeeting(MID, deps({ adapter: { name: "outro" } }).d)).reason, "provedor_indisponivel");
});

test("entrada: primeira gravação vence quando duas pessoas criam ao mesmo tempo", async () => {
  const state = { room: null };
  const mk = (url) => deps({
    roomGet: async () => state.room,
    roomSet: async (id, ref, u, h) => { if (!state.room) state.room = { ref, url: u, host_url: h }; return state.room; },
    adapter: { name: "daily", ensureRoom: async () => ({ ref: "ic-1", url, hostUrl: null }), accessFor: async ({ room }) => ({ url: room.url, token: "T" }) },
  }).d;
  const [x, y] = await Promise.all([joinMeeting(MID, mk("https://a")), joinMeeting(MID, mk("https://b"))]);
  assert.equal(x.url, y.url);
});

test("eventos do Daily são normalizados; desconhecidos viram null", () => {
  const j = normalizeDailyEvent({ type: "participant.joined", event_ts: 1800000000, payload: { room: "ic-1", session_id: "s1", user_id: UID, joined_at: 1799999990 } });
  assert.equal(j.kind, "joined"); assert.equal(j.userId, UID); assert.equal(j.joinedAt, 1799999990000);
  const l = normalizeDailyEvent({ type: "participant.left", event_ts: 1800000600, payload: { room: "ic-1", session_id: "s1", duration: 600 } });
  assert.equal(l.kind, "left"); assert.equal(l.joinedAt, 1800000000000); assert.equal(l.userId, null);
  assert.equal(normalizeDailyEvent({ type: "meeting.ended", payload: { room: "ic-1" } }).kind, "ended");
  assert.equal(normalizeDailyEvent({ type: "outro", payload: {} }), null);
  assert.equal(normalizeDailyEvent(null), null);
});

test("entrada: sem a medição de minutos do provedor a sala não abre e nada é criado", async () => {
  const { state, d } = deps({ meteringReady: async (p) => p !== "daily" });
  assert.deepEqual(await joinMeeting(MID, d), { ok: false, reason: "medicao_indisponivel" });
  assert.equal(state.created, 0);
  const sem = deps(); delete sem.d.meteringReady;
  assert.equal((await joinMeeting(MID, sem.d)).reason, "medicao_indisponivel", "esquecer de passar a conferência também fecha a sala");
});

test("0207: meeting.ended só encerra a reunião depois do horário previsto; o consumo fecha do mesmo jeito", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/0207_video_sala_nao_fecha_cedo.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  const f = sql.split("function public.video_close_room")[1];
  assert.match(f, /status = 'agendada' and now\(\) >= starts_at \+ make_interval\(mins => duration_min\)/);
  assert.match(f, /update public\.video_usage u set left_at/);
  assert.match(f, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
});

test("função de vídeo: confere a medição antes de abrir a sala e limpa avisos antigos ao cadastrar de novo", async () => {
  const { readFileSync } = await import("node:fs");
  const ts = readFileSync(new URL("../supabase/functions/video/index.ts", import.meta.url), "utf8");
  assert.match(ts, /meteringReady: async \(provider: string\)/);
  assert.doesNotMatch(ts, /whereby/i);
  assert.match(ts, /method: "DELETE"/);
  assert.match(ts, /w\.url === target/);
});

test("encerrar reunião: fecha a sala no provedor e os minutos; recusa do banco não toca no provedor", async () => {
  const calls = [];
  const adapter = { closeRoom: async (a) => { calls.push(["sala", a]); return true; } };
  const ok = await endMeeting(MID, {
    endMeeting: async () => ({ provider: "daily", room_name: "ic-x", provider_ref: "ic-x" }),
    adapterFor: () => adapter, closeUsage: async (room) => { calls.push(["uso", room]); },
  });
  assert.deepEqual(ok, { ok: true, room_closed: true });
  assert.deepEqual(calls, [["sala", { roomName: "ic-x", ref: "ic-x" }], ["uso", "ic-x"]]);
  const negado = []; 
  const r = await endMeeting(MID, { endMeeting: async () => { throw new Error("Sem permissão."); }, adapterFor: () => { negado.push(1); return adapter; }, closeUsage: async () => negado.push(2) });
  assert.equal(r.ok, false); assert.deepEqual(negado, []);
  assert.equal((await endMeeting("x", {})).reason, "pedido_invalido");
});

test("encerrar reunião: provedor fora do ar não desfaz o encerramento e os minutos fecham mesmo assim", async () => {
  const usos = [];
  const r = await endMeeting(MID, {
    endMeeting: async () => ({ provider: "daily", room_name: "ic-w", provider_ref: "ic-w" }),
    adapterFor: () => ({ closeRoom: async () => { throw new Error("rede"); } }), closeUsage: async (room) => usos.push(room),
  });
  assert.deepEqual(r, { ok: true, room_closed: false });
  assert.deepEqual(usos, ["ic-w"]);
});

test("adaptadores fecham a sala (por nome da sala); sala inexistente conta como fechada", async () => {
  const urls = [];
  const f = (status) => async (u, o) => { urls.push([o.method, u]); return res(status, {}); };
  assert.equal(await dailyAdapter(f(200), "k", "https://d.test").closeRoom({ roomName: "ic-a" }), true);
  assert.equal(await dailyAdapter(f(404), "k", "https://d.test").closeRoom({ roomName: "ic-a" }), true);
  assert.equal(await dailyAdapter(f(500), "k", "https://d.test").closeRoom({ roomName: "ic-a" }), false);
  assert.deepEqual(urls[0], ["DELETE", "https://d.test/rooms/ic-a"]);
});

test("encerrar reunião: banco só deixa a dona, só com a sala aberta, e cancelar não vale para sala aberta", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/0208_video_encerrar_reuniao.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.video_end/);
  assert.match(sql, /is_house_owner\(m\.house_id\)/);
  assert.match(sql, /now\(\) < m\.starts_at - interval '10 minutes'/);
  assert.match(sql, /now\(\) >= m\.starts_at - interval '10 minutes' then raise exception 'A sala já abriu/);
  assert.match(sql, /grant execute on function public\.video_end\(uuid\) to authenticated/);
  const ts = readFileSync(new URL("../supabase/functions/video/index.ts", import.meta.url), "utf8");
  assert.match(ts, /body\.action === "end"/);
  assert.match(ts, /asUser\.rpc\("video_end"/);
  const sala = readFileSync(new URL("../src/pages/Sala.tsx", import.meta.url), "utf8");
  assert.match(sala, /st\.s === "pronta" && st\.host/);
});

test("sala do Daily nasce em português do Brasil", async () => {
  let body;
  const f = async (u, o) => { if (String(u).endsWith("/rooms")) body = JSON.parse(o.body); return res(200, { url: "https://x.daily.co/ic-a" }); };
  await dailyAdapter(f, "k", "https://d.test").ensureRoom({ roomName: "ic-a", startsAt: START, durationMin: 30, maxParticipants: 5 });
  assert.equal(body.properties.lang, "pt-BR");
  assert.equal(body.privacy, "private");
});

test("parecer jurídico: ciência registrada pelo banco, retenção 12 meses/5 anos e textos com os pontos do advogado", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/0209_video_ciencia_e_retencao.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.video_acks from public, anon, authenticated/);
  assert.match(sql, /video_join_check\(p_meeting\)/);
  assert.match(sql, /kind = 'reuniao' and starts_at < now\(\) - interval '12 months'/);
  assert.match(sql, /kind = 'consulta' and starts_at < now\(\) - interval '5 years'/);
  const t = readFileSync(new URL("../src/content/institutional.ts", import.meta.url), "utf8");
  assert.match(t, /atualmente, o Daily e a LiveKit[,.)]/);
  assert.match(t, /não grava, não armazena e não tem acesso ao conteúdo de áudio ou vídeo/);
  assert.doesNotMatch(t, /cláusulas-padrão contratuais previstas na regulamentação da ANPD/);
  assert.match(t, /estritamente necessária para a execução do serviço de videoconferência solicitado por você \(LGPD, art\. 33, IX, em conjunto/);
  assert.match(t, /7\. Reuniões e consultas por vídeo/);
  assert.match(t, /isentar a \$\{BRAND\} e a ressarci-la/);
  assert.match(t, /maiores de 18 \(dezoito\) anos/);
  const sala = readFileSync(new URL("../src/pages/Sala.tsx", import.meta.url), "utf8");
  assert.match(sala, /Esta chamada não é gravada pela plataforma/);
  assert.match(sala, /ackMeeting\(id, LEGAL_VERSION\)/);
  const lc = readFileSync(new URL("../src/lib/legalCore.js", import.meta.url), "utf8");
  assert.match(lc, /atendimentos e reuniões por áudio e vídeo/);
});

test("Whereby saiu: nenhum rastro no código da função, no painel, na sala, nas permissões e nos textos; o banco só aceita o Daily", async () => {
  const { readFileSync } = await import("node:fs");
  const lerf = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  for (const f of ["../supabase/functions/video/core.js", "../supabase/functions/video/index.ts", "../src/lib/videoCore.js", "../src/lib/video.ts", "../src/components/admin/VideoCard.tsx", "../vercel.json", "../src/content/institutional.ts"]) assert.doesNotMatch(lerf(f), /whereby/i, f);
  const sql = lerf("../supabase/migrations/0210_video_somente_daily.sql");
  assert.match(sql, /not in \(''daily''\)/);
  assert.match(sql, /check \(provider in \('daily'\)\)/);
});

// ---- LiveKit ----
const LK = { url: "wss://ile.livekit.cloud", apiKey: "APIkey1", apiSecret: "segredo-de-teste-com-tamanho-bom-1234567890" };
const dec = (t) => JSON.parse(Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
const STARTS = new Date(Date.now() + 3600_000).toISOString();

test("LiveKit: adapterFor só entrega com url, chave e segredo", () => {
  assert.equal(adapterFor("livekit", fetch, { livekit: LK }).name, "livekit");
  assert.equal(adapterFor("livekit", fetch, { livekit: { ...LK, apiSecret: "" } }), null);
  assert.equal(adapterFor("livekit", fetch, {}), null);
});

test("LiveKit: token da pessoa traz sala, identidade, nome e validade até o fechamento", async () => {
  const a = livekitAdapter(fetch, LK);
  const r = await a.accessFor({ room: { url: LK.url }, roomName: "ic-1", userId: "11111111-1111-1111-1111-111111111111", displayName: "Ana", isHost: true, startsAt: STARTS, durationMin: 30 });
  assert.equal(r.url, LK.url);
  const [h, p, s] = r.token.split(".");
  assert.equal(dec(h).alg, "HS256");
  const c = dec(p);
  assert.equal(c.iss, LK.apiKey); assert.equal(c.sub, "11111111-1111-1111-1111-111111111111"); assert.equal(c.name, "Ana");
  assert.equal(c.video.room, "ic-1"); assert.equal(c.video.roomJoin, true); assert.ok(!c.video.roomAdmin);
  const w = roomWindow(STARTS, 30);
  assert.equal(c.exp, Math.floor(w.closes / 1000));
  const { createHmac } = await import("node:crypto");
  assert.equal(s, createHmac("sha256", LK.apiSecret).update(`${h}.${p}`).digest("base64url"));
});

test("LiveKit: criar e fechar sala chamam o servidor com credencial de administração", async () => {
  const calls = [];
  const f = async (u, o) => { calls.push([u, JSON.parse(o.body), dec(o.headers.Authorization.split(" ")[1].split(".")[1])]); return { ok: true, status: 200, json: async () => ({}) }; };
  const a = livekitAdapter(f, LK);
  const made = await a.ensureRoom({ roomName: "ic-1", startsAt: STARTS, durationMin: 30, maxParticipants: 4 });
  assert.deepEqual(made, { ref: "ic-1", url: LK.url, hostUrl: null });
  assert.equal(calls[0][0], "https://ile.livekit.cloud/twirp/livekit.RoomService/CreateRoom");
  assert.equal(calls[0][1].max_participants, 4);
  assert.equal(calls[0][2].video.roomCreate, true);
  assert.equal(await a.closeRoom({ roomName: "ic-1" }), true);
  assert.equal(calls[1][0], "https://ile.livekit.cloud/twirp/livekit.RoomService/DeleteRoom");
  assert.deepEqual(calls[1][1], { room: "ic-1" });
  assert.equal(calls[1][2].video.roomAdmin, true);
  const fail = livekitAdapter(async () => ({ ok: false, status: 500 }), LK);
  assert.equal(await fail.closeRoom({ roomName: "x" }), false);
  assert.equal(await livekitAdapter(async () => ({ ok: false, status: 404 }), LK).closeRoom({ roomName: "x" }), true);
  await assert.rejects(() => fail.ensureRoom({ roomName: "x", startsAt: STARTS, durationMin: 30, maxParticipants: 2 }), /provedor_indisponivel/);
});

test("LiveKit: aviso só vale com assinatura, chave e corpo corretos", async () => {
  const raw = JSON.stringify({ event: "participant_joined", room: { name: "ic-1" }, participant: { identity: "11111111-1111-1111-1111-111111111111", sid: "PA_1", joinedAt: 1700000000 } });
  const { createHash } = await import("node:crypto");
  const sha256 = createHash("sha256").update(raw).digest("base64");
  const now = Math.floor(Date.now() / 1000);
  const good = await signLivekitJwt(LK.apiKey, LK.apiSecret, { exp: now + 300, nbf: now - 10, sha256 });
  const base = { apiKey: LK.apiKey, apiSecret: LK.apiSecret, authorization: good, rawBody: raw };
  assert.equal(await verifyLivekitWebhook(base), true);
  assert.equal(await verifyLivekitWebhook({ ...base, rawBody: raw + " " }), false);
  assert.equal(await verifyLivekitWebhook({ ...base, apiSecret: "outro-segredo-qualquer-0123456789abcdef" }), false);
  assert.equal(await verifyLivekitWebhook({ ...base, apiKey: "outra" }), false);
  assert.equal(await verifyLivekitWebhook({ ...base, authorization: "" }), false);
  assert.equal(await verifyLivekitWebhook({ ...base, authorization: "abc.def.ghi" }), false);
  const velho = await signLivekitJwt(LK.apiKey, LK.apiSecret, { exp: now - 3600, sha256 });
  assert.equal(await verifyLivekitWebhook({ ...base, authorization: velho }), false);
  assert.equal(await verifyLivekitWebhook({ ...base, authorization: `Bearer ${good}` }), true);
});

test("LiveKit: eventos viram entrada, saída e fim da sala", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  const j = normalizeLivekitEvent({ event: "participant_joined", createdAt: 1700000005, room: { name: "ic-1" }, participant: { identity: id, sid: "PA_1", joinedAt: 1700000000 } });
  assert.deepEqual(j, { kind: "joined", room: "ic-1", session: "PA_1", userId: id, at: 1700000000_000, joinedAt: 1700000000_000 });
  const l = normalizeLivekitEvent({ event: "participant_left", createdAt: 1700000600, room: { name: "ic-1" }, participant: { identity: id, sid: "PA_1", joinedAt: 1700000000 } });
  assert.equal(l.kind, "left"); assert.equal(l.at, 1700000600_000); assert.equal(l.joinedAt, 1700000000_000);
  assert.deepEqual(normalizeLivekitEvent({ event: "room_finished", createdAt: 1700000900, room: { name: "ic-1" } }), { kind: "ended", room: "ic-1", at: 1700000900_000 });
  assert.equal(normalizeLivekitEvent({ event: "track_published", room: { name: "ic-1" } }), null);
  assert.equal(normalizeLivekitEvent({ event: "participant_joined", room: { name: "ic-1" }, participant: { identity: "x" } }), null);
  assert.equal(normalizeLivekitEvent({ event: "participant_joined", room: { name: "ic-1" }, participant: { identity: "nao-uuid", sid: "PA_2", joinedAt: 1700000000 } }).userId, null);
});

test("LiveKit: entrada sem aviso cadastrado não abre (medicao_indisponivel)", async () => {
  const deps = (ready) => ({
    joinCheck: async () => ({ ok: true, provider: "livekit", room_name: "ic-1", starts_at: STARTS, duration_min: 30, max_participants: 2, user_id: "11111111-1111-1111-1111-111111111111", display_name: "Ana", is_host: false, title: "T", kind: "reuniao", ends_at: STARTS }),
    meteringReady: async () => ready, roomGet: async () => null, roomSet: async () => null, adapter: livekitAdapter(async () => ({ ok: true, status: 200, json: async () => ({}) }), LK),
  });
  assert.equal((await joinMeeting(MID, deps(false))).reason, "medicao_indisponivel");
  const ok = await joinMeeting(MID, deps(true));
  assert.equal(ok.ok, true); assert.equal(ok.provider, "livekit"); assert.equal(ok.url, LK.url); assert.ok(ok.token.split(".").length === 3);
});

test("migração 0211 libera a LiveKit na configuração, na mensagem do painel e na coluna", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/0211_video_livekit.sql", import.meta.url), "utf8");
  assert.match(sql, /not in \(''daily'', ''livekit''\)/);
  assert.match(sql, /check \(provider in \('daily', 'livekit'\)\)/);
  assert.match(sql, /provedor \(Daily ou LiveKit\)/);
});

test("rotina: fecha as salas vencidas, fecha o uso, e uma falha não impede as outras", async () => {
  const { sweepRooms } = await import("../supabase/functions/video/core.js");
  const fechadas = [], usos = [];
  const r = await sweepRooms({
    rooms: async () => [{ room_name: "a", provider: "livekit" }, { room_name: "b", provider: "livekit" }, { room_name: "c", provider: "livekit" }, { room_name: "d", provider: "outro" }],
    adapterFor: (p) => (p === "livekit" ? { closeRoom: async ({ roomName }) => { if (roomName === "b") throw new Error("rede"); fechadas.push(roomName); return roomName !== "c"; } } : null),
    closeUsage: async (room) => usos.push(room),
  });
  assert.deepEqual(r, { ok: true, total: 4, closed: 1, failed: 3 });
  assert.deepEqual(fechadas, ["a", "c"]); assert.deepEqual(usos, ["a"]);
  assert.deepEqual(await sweepRooms({ rooms: async () => null, adapterFor: () => null, closeUsage: async () => {} }), { ok: true, total: 0, closed: 0, failed: 0 });
});

test("migração 0212: rotina só do servidor, segredo no cofre, a cada 5 minutos", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/0212_video_fecha_sala_no_limite.sql", import.meta.url), "utf8");
  assert.match(sql, /vault\.create_secret[\s\S]*video_cron_secret/);
  assert.match(sql, /grant execute on function public\.video_cron_ok\(text\), public\.video_rooms_to_close\(\) to service_role/);
  assert.match(sql, /revoke all on function public\.video_cron_ok\(text\), public\.video_rooms_to_close\(\) from public, anon, authenticated/);
  assert.match(sql, /cron\.schedule\('video-sweep', '\*\/5 \* \* \* \*'/);
  assert.match(sql, /x-video-cron-secret/);
  const idx = readFileSync(new URL("../supabase/functions/video/index.ts", import.meta.url), "utf8");
  assert.match(idx, /video_cron_ok/);
});
