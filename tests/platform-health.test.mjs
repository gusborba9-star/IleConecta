import test from "node:test";
import assert from "node:assert/strict";
import { readHealth, overallStatus, cronState, ago, megabytes } from "../src/lib/platformHealthCore.js";

const base = { generated_at: "2026-11-17T22:00:00Z", last_hour: { erro_app: 0, ia_falha: 0, funcao_erro: 0 }, last_24h: { erro_app: 2, ia_falha: 0, funcao_erro: 0 },
  top: [], cron: [{ name: "a", schedule: "* * * * *", active: true, last_run: "2026-11-17T21:59:00Z", last_status: "succeeded", runs_24h: 1440, failed_24h: 0, failed_30min: 0 }], db: { size_bytes: 27 * 1048576, connections: 7 }, alerts: [] };

test("leitura defensiva: lixo, nulo e tipos errados viram um quadro vazio sem quebrar", () => {
  for (const raw of [null, undefined, 42, "x", [], {}, { cron: "x", top: 5, alerts: {}, db: "z", last_hour: [] }]) {
    const h = readHealth(raw);
    assert.equal(h.lastHour.erro_app, 0); assert.deepEqual(h.cron, []); assert.deepEqual(h.top, []); assert.deepEqual(h.alerts, []);
    assert.equal(overallStatus(h), "ok");
  }
  const h = readHealth({ ...base, top: [{ kind: "erro_app", source: "app", route: null, detail: "<img src=x onerror=alert(1)>", n: "3", last_at: "lixo" }], cron: [{ name: 5, schedule: null }] });
  assert.equal(h.top[0].n, 3); assert.equal(h.top[0].lastAt, null); assert.equal(h.top[0].detail, "<img src=x onerror=alert(1)>", "texto fica como texto (a tela nunca o interpreta como HTML)");
  assert.equal(h.cron[0].name, ""); assert.equal(h.cron[0].active, true);
});

test("limites: no máximo 8 erros, 100 rotinas e 50 alertas; textos cortados", () => {
  const h = readHealth({ top: Array.from({ length: 30 }, () => ({ detail: "x".repeat(900), n: 1 })), cron: Array.from({ length: 500 }, () => ({ name: "n".repeat(300) })), alerts: Array.from({ length: 200 }, () => ({ code: "c".repeat(500) })) });
  assert.equal(h.top.length, 8); assert.equal(h.top[0].detail.length, 400); assert.equal(h.cron.length, 100); assert.equal(h.cron[0].name.length, 80); assert.equal(h.alerts.length, 50); assert.equal(h.alerts[0].code.length, 120);
});

test("estado geral: ok, observar (erros na última hora), atenção (alerta aberto ou rotina falhando)", () => {
  assert.equal(overallStatus(readHealth(base)), "ok", "erros antigos (24 h) sozinhos não alarmam");
  assert.equal(overallStatus(readHealth({ ...base, last_hour: { erro_app: 1 } })), "observar");
  assert.equal(overallStatus(readHealth({ ...base, alerts: [{ code: "pico:erro_app", since: "2026-11-17T21:50:00Z" }] })), "atencao");
  assert.equal(overallStatus(readHealth({ ...base, cron: [{ ...base.cron[0], failed_30min: 1 }] })), "atencao");
});

test("estado de cada rotina", () => {
  const now = Date.parse("2026-11-17T22:00:00Z");
  const c = (o) => readHealth({ cron: [{ name: "x", schedule: "* * * * *", active: true, last_run: "2026-11-17T21:59:00Z", ...o }] }).cron[0];
  assert.equal(cronState(c({}), now), "ok");
  assert.equal(cronState(c({ failed_30min: 1 }), now), "falhando");
  assert.equal(cronState(c({ failed_24h: 2 }), now), "falhou_antes");
  assert.equal(cronState(c({ last_run: "2026-11-17T18:00:00Z" }), now), "parada");
  assert.equal(cronState(c({ schedule: "0 11 * * *", last_run: "2026-11-16T11:00:00Z" }), now), "ok", "a diária não é 'parada'");
  assert.equal(cronState(c({ active: false }), now), "desligada");
  assert.equal(cronState(c({ last_run: null }), now), "ainda_nao_rodou");
});

test("formatação", () => {
  const now = Date.parse("2026-11-17T22:00:00Z");
  assert.equal(ago("2026-11-17T21:59:40Z", now), "agora há pouco"); assert.equal(ago("2026-11-17T21:30:00Z", now), "há 30 min");
  assert.equal(ago("2026-11-17T19:00:00Z", now), "há 3 h"); assert.equal(ago("2026-11-14T22:00:00Z", now), "há 3 dia(s)");
  assert.equal(ago("lixo", now), "—"); assert.equal(ago(null, now), "—");
  assert.equal(megabytes(27 * 1048576), "27 MB"); assert.equal(megabytes("x"), "0 MB");
});

test("rotinas: descrição em português e 'quando roda'", async () => {
  const { CRON_DESCRIPTIONS, cronDescription, cronWhen } = await import("../src/lib/platformHealthCore.js");
  assert.equal(cronWhen("* * * * *"), "a cada minuto");
  assert.equal(cronWhen("*/10 * * * *"), "a cada 10 minutos");
  assert.equal(cronWhen("5 * * * *"), "de hora em hora (no minuto 5)");
  assert.equal(cronWhen("0 11 * * *"), "todo dia às 08:00 (Brasília)");
  assert.equal(cronWhen("35 9 * * *"), "todo dia às 06:35 (Brasília)");
  assert.equal(cronWhen("30 3 * * *"), "todo dia às 00:30 (Brasília)");
  assert.equal(cronWhen("0 0 1 * *"), "");
  assert.equal(cronWhen(undefined), "");
  assert.equal(cronDescription("nao-existe"), "");
  for (const k of ["expire-stale-holds", "refund-sweep", "purge-system-events", "health-check", "run-account-deletions"]) assert.ok(cronDescription(k).length > 20, k);
  assert.ok(Object.values(CRON_DESCRIPTIONS).every((t) => /^[A-ZÀ-Ú]/.test(t) && t.endsWith(".")));
});

test("toda rotina agendada nas migrations tem descrição em português (rotina nova sem texto falha aqui)", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { cronDescription } = await import("../src/lib/platformHealthCore.js");
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const names = new Set();
  for (const f of readdirSync(dir)) for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/cron\.schedule\(\s*'([a-z0-9-]+)'/g)) names.add(m[1]);
  assert.ok(names.size >= 18, `achou ${names.size} rotinas`);
  const sem = [...names].filter((n) => !cronDescription(n));
  assert.deepEqual(sem, []);
});
