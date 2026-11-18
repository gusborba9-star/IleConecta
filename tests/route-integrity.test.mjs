// Varredura estática: todo link/navegação do app aponta para uma rota que existe, e os ids usados em /casa/ e /mensagens/ são os da CONTA (nunca o id interno da casa).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(p) ? [p] : []; });
const files = walk("src");
const app = readFileSync("src/App.tsx", "utf8");
const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
const toRe = (r) => new RegExp("^" + r.replace(/:[A-Za-z]+/g, "[^/]+") + "$");
const routeRes = routes.map(toRe);

// Literais de caminho passados a nav(...), navigate(...), to=, href= e Navigate to=
const CALL = /(?:nav|navigate)\(\s*([`"'])(\/[^`"']*)\1|(?:\bto|\bhref)=(?:\{\s*)?([`"'])(\/[^`"']*)\3/g;
const found = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(CALL)) found.push({ f, raw: m[2] ?? m[4] });
}

test("todo destino literal existe em App.tsx", () => {
  assert.ok(found.length > 40, `esperava dezenas de destinos, achei ${found.length}`);
  const bad = [];
  for (const { f, raw } of found) {
    const path = raw.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, "x");
    if (path.startsWith("/c/") || path.startsWith("/sobre/")) continue;
    if (!routeRes.some((r) => r.test(path))) bad.push(`${f}: ${raw}`);
  }
  assert.deepEqual(bad, []);
});

test("ids em /casa/ e /mensagens/ nunca vêm do id interno da casa (house_id/houseRowId/billing)", () => {
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\/(?:casa|mensagens)\/\$\{([^}]*)\}/g)) {
      if (/houseRowId|house_id|billing|status\.houseId|link\.houseId|view\.houseId/i.test(m[1])) bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("conjunto de expressões de id usadas em /casa/ e /mensagens/ é o revisado (novo uso exige revisão)", () => {
  const exprs = new Set();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/\/(?:casa|mensagens)\/\$\{([^}]*)\}/g)) exprs.add(m[1]);
  const reviewed = new Set(["item.personId", "house.id", "me", "h.id", "ownerId", "r.ownerId", "o.houseOwnerId", "house?.id", "house.ownerId", "ritual.houseId", "otherId", "oid", "c.otherId", "userId ?? \"\"", "user.id", "peer.id", "other.id", "m.ownerId", "i.houseOwnerId", "encodeURIComponent(ownerUserId)", "currentUser?.id", "currentUser.id", "author?.id", "group.ownerId", "userId"]);
  assert.deepEqual([...exprs].filter((e) => !reviewed.has(e)), []);
});
