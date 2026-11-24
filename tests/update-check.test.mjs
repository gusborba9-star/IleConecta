import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasNewVersion, readRemoteBuild } from "../src/lib/updateCheckCore.js";

test("aviso de versão nova: só quando a publicação do servidor é diferente e confiável", () => {
  assert.equal(hasNewVersion("abc", "abc"), false);
  assert.equal(hasNewVersion("abc", "def"), true);
  assert.equal(hasNewVersion("abc", " abc "), false);
  assert.equal(hasNewVersion("abc", null), false);
  assert.equal(hasNewVersion(undefined, "def"), false);
  assert.equal(hasNewVersion("", "def"), false);
});

test("leitura do version.json: formato estranho vira null", () => {
  assert.equal(readRemoteBuild({ build: "abc123" }), "abc123");
  for (const bad of [null, undefined, "x", 5, {}, { build: "" }, { build: 7 }, { build: "x".repeat(81) }]) assert.equal(readRemoteBuild(bad), null);
});

test("publicação gera version.json sem cache e o app confere ao voltar e a cada 5 minutos, sem recarregar sozinho", () => {
  const v = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(v, /fileName: "version\.json"/);
  assert.match(v, /VERCEL_GIT_COMMIT_SHA/);
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const h = vercel.headers.find((x) => x.source === "/version.json");
  assert.match(h.headers[0].value, /no-store/);
  const hook = readFileSync(new URL("../src/hooks/useUpdatePrompt.ts", import.meta.url), "utf8");
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /5 \* 60_000/);
  assert.match(hook, /cache: "no-store"/);
  assert.doesNotMatch(hook, /location\.reload\(\);\s*\n/);
});
