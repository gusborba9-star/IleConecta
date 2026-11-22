import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nearestPlace, readPlaceNow, distanceKm, MAX_KM } from "../src/lib/geoCore.js";

const T = JSON.parse(readFileSync(new URL("../src/data/municipios.json", import.meta.url), "utf8"));

test("tabela completa de municípios", () => {
  assert.ok(T.length > 5500);
  assert.ok(T.every((r) => r.length === 4 && /^[A-Z]{2}$/.test(r[1]) && Number.isFinite(r[2]) && Number.isFinite(r[3])));
});
test("Praça da Sé identifica São Paulo, SP; Porto Alegre, RS", () => {
  assert.deepEqual(nearestPlace(-23.55, -46.634, T) && { c: nearestPlace(-23.55, -46.634, T).city, s: nearestPlace(-23.55, -46.634, T).state }, { c: "São Paulo", s: "SP" });
  const p = nearestPlace(-30.0346, -51.2177, T);
  assert.equal(p.city, "Porto Alegre"); assert.equal(p.state, "RS");
});
test("fora do Brasil, no mar ou coordenada inválida: null", () => {
  assert.equal(nearestPlace(48.85, 2.35, T), null); // Paris
  assert.equal(nearestPlace(-25, -30, T), null); // Atlântico
  assert.equal(nearestPlace(NaN, 0, T), null);
  assert.equal(nearestPlace(91, 0, T), null);
  assert.equal(nearestPlace(0, 0, null), null);
});
test("distância conhecida e limite", () => {
  const d = distanceKm(-23.55, -46.63, -22.9, -43.17); // SP–RJ ~360 km
  assert.ok(d > 340 && d < 380);
  assert.ok(MAX_KM <= 100);
});
test("lugar do momento: vale 7 dias, só UF válida", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const ok = { city: "São Paulo", state: "SP", at: now - 6 * 86_400_000 };
  assert.deepEqual(readPlaceNow(JSON.stringify(ok), now), ok);
  assert.equal(readPlaceNow({ ...ok, at: now - 8 * 86_400_000 }, now), null);
  assert.equal(readPlaceNow({ ...ok, at: now + 3_600_000 }, now), null);
  assert.equal(readPlaceNow({ ...ok, state: "sp" }, now), null);
  assert.equal(readPlaceNow({ ...ok, city: "" }, now), null);
  assert.equal(readPlaceNow("{", now), null);
  assert.equal(readPlaceNow(null, now), null);
});
