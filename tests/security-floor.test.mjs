import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lockfile pins the patched Tailwind-compatible selector parser 6.x backport", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const parserEntries = Object.entries(lock.packages).filter(([path]) => path.endsWith("/postcss-selector-parser"));
  const parser = lock.packages["node_modules/postcss-selector-parser"];

  assert.equal(parser.version, "6.1.5");
  assert.equal(parser.resolved, "https://registry.npmjs.org/postcss-selector-parser/-/postcss-selector-parser-6.1.5.tgz");
  assert.match(parser.integrity, /^sha512-/);
  assert.ok(parserEntries.length >= 1);
  assert.ok(parserEntries.every(([, entry]) => entry.version === "6.1.5"));
  assert.equal(manifest.overrides["@tailwindcss/typography"]["postcss-selector-parser"], "6.1.5");
});
