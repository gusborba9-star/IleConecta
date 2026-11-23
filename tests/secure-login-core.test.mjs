import test from "node:test";
import assert from "node:assert/strict";
import { deviceLabel, newDeviceId, lockMessage, LOGIN_ERRORS } from "../src/lib/secureLoginCore.js";
import { randomBytes } from "node:crypto";

test("nome do aparelho: só sistema e navegador, sem versão nem identificador", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"), "Android · Chrome");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604.1"), "iPhone/iPad · Safari");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537 Edg/120"), "Windows · Edge");
  assert.equal(deviceLabel(undefined), "Aparelho · navegador");
  assert.doesNotMatch(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Firefox/121.0"), /\d/);
});

test("id do aparelho: 43 caracteres seguros para URL, diferente a cada vez", () => {
  const a = newDeviceId((n) => randomBytes(n)), b = newDeviceId((n) => randomBytes(n));
  assert.match(a, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a, b);
});

test("mensagem de bloqueio: não afirma que a conta existe e mostra o tempo restante", () => {
  const now = Date.parse("2026-11-23T20:00:00Z");
  assert.match(lockMessage("2026-11-23T20:15:00Z", false, now), /15 min/);
  assert.match(lockMessage("2026-11-23T21:00:00Z", false, now), /1 h/);
  assert.match(lockMessage(undefined, false, now), /15 min/);
  for (const m of [lockMessage("2026-11-23T20:15:00Z", false, now), lockMessage("x", true, now)]) assert.match(m, /Se existir uma conta/);
  assert.match(lockMessage("x", true, now), /Perdi o acesso/);
  assert.ok(LOGIN_ERRORS.credenciais && LOGIN_ERRORS.indisponivel);
});
