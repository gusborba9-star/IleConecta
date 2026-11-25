import test from "node:test";
import assert from "node:assert/strict";
import { bankView, embedUrl, formatWhen, joinReasonText, localToIso, meetingPhase, readVideoConfig, validateSchedule } from "../src/lib/videoCore.js";

const NOW = Date.parse("2026-12-01T12:00:00Z");
const ok = { kind: "reuniao", title: "Gira", startsAtIso: new Date(NOW + 3600_000).toISOString(), duration: 60, max: 50 };

test("agendamento: mesmas regras do banco", () => {
  assert.equal(validateSchedule(ok, NOW), null);
  assert.match(validateSchedule({ ...ok, title: "  " }, NOW), /título/);
  assert.match(validateSchedule({ ...ok, title: "x".repeat(81) }, NOW), /título/);
  assert.match(validateSchedule({ ...ok, duration: 4 }, NOW), /duração/);
  assert.match(validateSchedule({ ...ok, duration: 91 }, NOW), /duração/);
  assert.match(validateSchedule({ ...ok, startsAtIso: new Date(NOW - 3600_000).toISOString() }, NOW), /horário/);
  assert.match(validateSchedule({ ...ok, startsAtIso: new Date(NOW + 121 * 86_400_000).toISOString() }, NOW), /120 dias/);
  assert.match(validateSchedule({ ...ok, max: 101 }, NOW), /2 a 100/);
  assert.match(validateSchedule({ ...ok, max: 1 }, NOW), /2 a 100/);
  assert.match(validateSchedule({ ...ok, kind: "x" }, NOW), /tipo/);
  assert.match(validateSchedule({ ...ok, startsAtIso: null }, NOW), /dia e a hora/);
});
test("consulta exige pedido e ignora a lotação", () => {
  assert.match(validateSchedule({ ...ok, kind: "consulta", max: undefined }, NOW), /pedido/);
  assert.equal(validateSchedule({ ...ok, kind: "consulta", max: undefined, orderId: "o1" }, NOW), null);
});
test("fase da reunião: abre 10 min antes e fecha 10 min depois do fim", () => {
  const m = { starts_at: new Date(NOW).toISOString(), duration_min: 30 };
  assert.equal(meetingPhase(m, NOW - 11 * 60_000), "cedo");
  assert.equal(meetingPhase(m, NOW - 9 * 60_000), "aberta");
  assert.equal(meetingPhase(m, NOW + 40 * 60_000), "aberta");
  assert.equal(meetingPhase(m, NOW + 41 * 60_000), "encerrada");
  assert.equal(meetingPhase({}, NOW), "encerrada");
});
test("banco: aviso a partir de 80%, esgotado em 0, sem vídeo com teto 0", () => {
  assert.equal(bankView({ cap: 6000, used: 1000, remaining: 5000 }).level, "ok");
  assert.equal(bankView({ cap: 6000, used: 4800, remaining: 1200 }).level, "warn");
  assert.equal(bankView({ cap: 6000, used: 6000, remaining: 0 }).level, "out");
  assert.equal(bankView({ cap: 0, used: 0, remaining: 0 }).level, "out");
  assert.equal(bankView(null).cap, 0);
  assert.equal(bankView({ cap: 100, used: 500, remaining: 0 }).pct, 100);
});
test("data e hora do aparelho viram instante; lixo vira null", () => {
  assert.match(localToIso("2026-12-01", "19:30"), /^2026-12-0[12]T/);
  assert.equal(localToIso("01/12/2026", "19:30"), null);
  assert.equal(localToIso("2026-12-01", ""), null);
});
test("mensagens de recusa cobrem os motivos do servidor", () => {
  for (const r of ["sem_login", "indisponivel", "sem_acesso", "desligado", "encerrada", "sem_minutos", "lotada", "provedor_indisponivel"]) assert.ok(joinReasonText(r).length > 10, r);
  assert.match(joinReasonText("cedo", "2026-12-01T22:00:00Z"), /10 minutos antes/);
  assert.match(joinReasonText("qualquer"), /Não foi possível/);
  assert.ok(formatWhen("2026-12-01T22:00:00Z").includes("19:00"));
});
test("iframe: só https dos provedores; Daily exige token", () => {
  assert.equal(embedUrl("daily", "https://ileconecta.daily.co/ic-1", "T"), "https://ileconecta.daily.co/ic-1?t=T");
  assert.equal(embedUrl("daily", "https://ileconecta.daily.co/ic-1", ""), null);
  assert.equal(embedUrl("whereby", "https://ile-conecta.whereby.com/ic-x?embed&displayName=Ana", null), null);
  assert.equal(embedUrl("daily", "http://x.daily.co/r", "T"), null);
  assert.equal(embedUrl("daily", "https://evil.com/r", "T"), null);
  assert.equal(embedUrl("daily", "https://daily.co.evil.com/r", "T"), null);
  assert.equal(embedUrl("outro", "https://x.daily.co/r", "T"), null);
  assert.equal(embedUrl("daily", "javascript:alert(1)", "T"), null);
});
test("configuração: valores inválidos voltam ao padrão seguro", () => {
  assert.deepEqual(readVideoConfig(null), { state: "off", provider: "daily", beta_houses: [] });
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(readVideoConfig({ state: "beta", provider: "whereby", beta_houses: [id, id, "x", 3] }), { state: "beta", provider: "daily", beta_houses: [id] });
  assert.equal(readVideoConfig({ state: "hack" }).state, "off");
});

test("LiveKit: só servidor wss da LiveKit Cloud; nunca vai para iframe", async () => {
  const { livekitServerUrl, VIDEO_PROVIDERS } = await import("../src/lib/videoCore.js");
  assert.ok(VIDEO_PROVIDERS.includes("livekit"));
  assert.equal(livekitServerUrl("wss://ile-abc.livekit.cloud"), "wss://ile-abc.livekit.cloud");
  assert.equal(livekitServerUrl("wss://evil.com"), null);
  assert.equal(livekitServerUrl("wss://livekit.cloud.evil.com"), null);
  assert.equal(livekitServerUrl("https://x.livekit.cloud"), null);
  assert.equal(livekitServerUrl("javascript:1"), null);
  assert.equal(embedUrl("livekit", "https://x.livekit.cloud/r", "T"), null);
});

test("validateSchedule: reunião com pessoas escolhidas exige de 1 a 99 e dispensa o limite de lotação", () => {
  const base = { kind: "reuniao", title: "Gira", startsAtIso: new Date(Date.now() + 3600_000).toISOString(), duration: 60, max: "xx" };
  assert.equal(validateSchedule({ ...base, audience: "escolher", invitees: [] }), "Escolha pelo menos uma pessoa para convidar.");
  assert.equal(validateSchedule({ ...base, audience: "escolher", invitees: ["a", "a"] }), null);
  assert.equal(validateSchedule({ ...base, audience: "escolher", invitees: Array.from({ length: 100 }, (_, i) => `u${i}`) }), "Escolha até 99 pessoas.");
  assert.equal(validateSchedule({ ...base, audience: "todos" }), "A reunião comporta de 2 a 100 pessoas.");
  assert.equal(validateSchedule({ ...base, max: 50 }), null);
  assert.equal(validateSchedule({ kind: "consulta", title: "x", startsAtIso: base.startsAtIso, duration: 30, orderId: "o", audience: "escolher", invitees: [] }), null);
});

test("cartões da tela inicial: só o que abre em até 24 h ou está aberto, ordenado e com estado certo", async () => {
  const { homeMeetingCards } = await import("../src/lib/videoCore.js");
  const now = Date.parse("2026-11-24T15:00:00-03:00");
  const at = (min) => new Date(now + min * 60_000).toISOString();
  const lista = [
    { id: "longe", startsAt: at(60 * 30), durationMin: 30 },
    { id: "amanha", startsAt: at(60 * 20), durationMin: 30 },
    { id: "encerrada", startsAt: at(-120), durationMin: 30 },
    { id: "aberta", startsAt: at(-5), durationMin: 30 },
    { id: "hoje", startsAt: at(120), durationMin: 30 },
    { id: "quebrada", startsAt: "xx", durationMin: 30 },
  ];
  const r = homeMeetingCards(lista, now);
  assert.deepEqual(r.map((x) => [x.id, x.state]), [["aberta", "aberta"], ["hoje", "hoje"], ["amanha", "amanha"]]);
  assert.equal(homeMeetingCards(null, now).length, 0);
  assert.equal(homeMeetingCards(Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, startsAt: at(i + 1), durationMin: 30 })), now).length, 3);
  // 10 min antes já conta como aberta; 11 min antes ainda não
  assert.equal(homeMeetingCards([{ id: "a", startsAt: at(10), durationMin: 30 }], now)[0].state, "aberta");
  assert.equal(homeMeetingCards([{ id: "a", startsAt: at(11), durationMin: 30 }], now)[0].state, "hoje");
});

import { KINDS, ROLE_LABEL, presenceCsv, presenceSummary } from "../src/lib/videoCore.js";

test("Vídeo 2.0: textos da sala de espera e tipos", () => {
  assert.match(joinReasonText("espera"), /Aguardando a casa liberar/);
  assert.match(joinReasonText("negado_espera"), /não liberou/);
  assert.equal(KINDS.atividade, "Atividade ao vivo");
  assert.equal(ROLE_LABEL.coanfitriao, "Coanfitrião");
});

const rows = [
  { name: "Ana", role: "participante", expected: true, firstIn: "2026-12-01T20:00:00Z", lastOut: "2026-12-01T21:00:00Z", minutes: 58, sessions: 2, removed: false },
  { name: "Bia", role: "participante", expected: true, firstIn: null, lastOut: null, minutes: 0, sessions: 0, removed: false },
  { name: "=CMD()", role: "moderador", expected: false, firstIn: "2026-12-01T20:05:00Z", lastOut: null, minutes: 10, sessions: 1, removed: false },
  { name: "Caio; \"o\" grande", role: "participante", expected: true, firstIn: "2026-12-01T20:10:00Z", lastOut: "2026-12-01T20:20:00Z", minutes: 10, sessions: 1, removed: true },
];

test("Vídeo 2.0: resumo de presença conta esperados, presentes, ausentes e minutos", () => {
  assert.deepEqual(presenceSummary(rows), { expected: 3, present: 3, absent: 1, minutes: 78 });
  assert.deepEqual(presenceSummary(null), { expected: 0, present: 0, absent: 0, minutes: 0 });
});

test("Vídeo 2.0: planilha de presença (BOM, ponto e vírgula, aspas e proteção contra fórmula)", () => {
  const csv = presenceCsv(rows);
  assert.ok(csv.startsWith("﻿Nome;Função;Esperado;Compareceu;"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 5);
  assert.match(lines[1], /^Ana;Participante;sim;sim;/);
  assert.match(lines[2], /^Bia;Participante;sim;não;;;0;0;não$/);
  assert.match(lines[3], /^'=CMD\(\);Moderador;/);
  assert.match(lines[4], /^"Caio; ""o"" grande";/);
  assert.match(lines[4], /;sim$/);
});
