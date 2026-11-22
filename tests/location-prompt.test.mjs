import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowLocationPrompt, missingLocation, cleanCity, COOLDOWN_DAYS } from "../src/lib/locationPromptCore.js";

const DAY = 86_400_000, now = Date.UTC(2026, 10, 22, 12);
const sem = { city: "", state: "BA" }, com = { city: "Salvador", state: "BA" };

test("falta cidade ou estado = pede; completo = nunca", () => {
  assert.equal(missingLocation(sem), true);
  assert.equal(missingLocation({ city: "Salvador", state: " " }), true);
  assert.equal(missingLocation(com), false);
  assert.equal(shouldShowLocationPrompt({ user: com, context: "inline", now }), false);
});
test("início: aparece de primeira, some por 3 dias depois do 'Agora não' e volta", () => {
  assert.equal(shouldShowLocationPrompt({ user: sem, now }), true);
  assert.equal(shouldShowLocationPrompt({ user: sem, dismissedAt: now - DAY, now }), false);
  assert.equal(shouldShowLocationPrompt({ user: sem, dismissedAt: now - COOLDOWN_DAYS * DAY, now }), true);
});
test("contexto: aparece sempre, mesmo logo depois do 'Agora não'", () => {
  assert.equal(shouldShowLocationPrompt({ user: sem, dismissedAt: now - 1000, context: "inline", now }), true);
});
test("cidade limpa", () => {
  assert.equal(cleanCity("  São   Paulo "), "São Paulo");
  assert.equal(cleanCity(null), "");
  assert.equal(cleanCity("a".repeat(200)).length, 80);
});
