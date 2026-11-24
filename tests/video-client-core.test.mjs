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
