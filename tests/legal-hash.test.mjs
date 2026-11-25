import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legalFingerprint } from "../scripts/legal-hash.mjs";

const saved = JSON.parse(readFileSync(new URL("./fixtures/legal-hash.json", import.meta.url), "utf8"));

test("o texto jurídico só muda com decisão explícita (material sobe DOC_MIN_VERSION; editorial só atualiza a impressão digital)", () => {
  const now = legalFingerprint();
  assert.equal(
    now.hash,
    saved.hash,
    "Os textos de aceite/Termos/Privacidade/Taxas mudaram. Decida: MATERIAL => suba DOC_MIN_VERSION e LEGAL_VERSION (o aceite reaparece para todos); EDITORIAL => só rode `node scripts/legal-hash.mjs --write`.",
  );
  assert.deepEqual(now.minVersion, saved.minVersion, "DOC_MIN_VERSION mudou: rode `node scripts/legal-hash.mjs --write` para registrar a decisão.");
});
