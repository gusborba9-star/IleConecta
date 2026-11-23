import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { adapterFor, dailyAdapter, joinMeeting, normalizeDailyEvent, normalizeWherebyEvent, roomWindow, verifyDailySignature, verifyWherebySignature, wherebyAdapter } from "../supabase/functions/video/core.js";

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

test("assinatura do Whereby: t=,v1=", async () => {
  const secret = "segredo", now = Date.now(), t = String(Math.floor(now / 1000)), body = '{"type":"x"}';
  const v1 = (await hm(new TextEncoder().encode(secret), `${t}.${body}`)).toString("hex");
  assert.equal(await verifyWherebySignature({ secret, header: `t=${t},v1=${v1}`, rawBody: body, nowMs: now }), true);
  assert.equal(await verifyWherebySignature({ secret, header: `t=${t},v1=${v1}`, rawBody: body + "1", nowMs: now }), false);
  assert.equal(await verifyWherebySignature({ secret: "outro", header: `t=${t},v1=${v1}`, rawBody: body, nowMs: now }), false);
  assert.equal(await verifyWherebySignature({ secret, header: "lixo", rawBody: body, nowMs: now }), false);
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

test("Whereby: cria reunião e monta o endereço embutido (anfitrião usa o próprio)", async () => {
  let sent;
  const a = wherebyAdapter(async (u, init) => { sent = JSON.parse(init.body); return res(201, { meetingId: "M1", roomUrl: "https://ic.whereby.com/ic-x", hostRoomUrl: "https://ic.whereby.com/ic-x?roomKey=H" }); }, "K");
  const r = await a.ensureRoom({ startsAt: START, durationMin: 30, maxParticipants: 10 });
  assert.equal(r.ref, "M1");
  assert.equal(sent.roomMode, "group");
  const guest = await a.accessFor({ room: { url: r.url, hostUrl: r.hostUrl }, displayName: "Ana <b>", isHost: false });
  assert.match(guest.url, /^https:\/\/ic\.whereby\.com\/ic-x\?embed&displayName=/);
  assert.doesNotMatch(guest.url, /roomKey/);
  assert.doesNotMatch(decodeURIComponent(guest.url), /[<>]/);
  const host = await a.accessFor({ room: { url: r.url, hostUrl: r.hostUrl }, displayName: "Dona", isHost: true });
  assert.match(host.url, /roomKey=H/);
});

test("adapterFor só entrega o provedor com chave", () => {
  assert.equal(adapterFor("daily", fetch, { daily: "k", whereby: "" }).name, "daily");
  assert.equal(adapterFor("whereby", fetch, { daily: "k", whereby: "" }), null);
  assert.equal(adapterFor("outro", fetch, { daily: "k", whereby: "k" }), null);
});

function deps(over = {}) {
  const state = { room: null, created: 0 };
  return { state, d: {
    joinCheck: async () => ({ ok: true, room_name: "ic-1", provider: "daily", is_host: false, display_name: "Ana", user_id: UID, kind: "reuniao", title: "Encontro", starts_at: START, duration_min: 60, max_participants: 50, ends_at: START }),
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
  assert.equal((await joinMeeting(MID, deps({ adapter: { name: "whereby" } }).d)).reason, "provedor_indisponivel");
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

test("eventos do Daily e do Whereby são normalizados; desconhecidos viram null", () => {
  const j = normalizeDailyEvent({ type: "participant.joined", event_ts: 1800000000, payload: { room: "ic-1", session_id: "s1", user_id: UID, joined_at: 1799999990 } });
  assert.equal(j.kind, "joined"); assert.equal(j.userId, UID); assert.equal(j.joinedAt, 1799999990000);
  const l = normalizeDailyEvent({ type: "participant.left", event_ts: 1800000600, payload: { room: "ic-1", session_id: "s1", duration: 600 } });
  assert.equal(l.kind, "left"); assert.equal(l.joinedAt, 1800000000000); assert.equal(l.userId, null);
  assert.equal(normalizeDailyEvent({ type: "meeting.ended", payload: { room: "ic-1" } }).kind, "ended");
  assert.equal(normalizeDailyEvent({ type: "outro", payload: {} }), null);
  assert.equal(normalizeDailyEvent(null), null);
  const wj = normalizeWherebyEvent({ type: "room.client.joined", createdAt: "2026-12-01T18:00:00Z", data: { meetingId: "M1", participantId: "p1", externalId: "x" } });
  assert.equal(wj.kind, "joined"); assert.equal(wj.room, "M1"); assert.equal(wj.userId, null);
  const wl = normalizeWherebyEvent({ type: "room.client.left", createdAt: "2026-12-01T18:30:00Z", data: { meetingId: "M1", participantId: "p1" } });
  assert.equal(wl.kind, "left"); assert.equal(wl.joinedAt, null);
  assert.equal(normalizeWherebyEvent({ type: "room.session.started", data: {} }), null);
});
