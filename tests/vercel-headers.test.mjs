import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const h = Object.fromEntries(cfg.headers[0].headers.map((x) => [x.key, x.value]));

test("câmera e microfone só para o próprio site e os dois provedores de vídeo", () => {
  for (const f of ["camera", "microphone"]) {
    const m = h["Permissions-Policy"].match(new RegExp(`${f}=\\(([^)]*)\\)`));
    assert.ok(m, f);
    assert.match(m[1], /^self "https:\/\/ileconecta\.daily\.co" "https:\/\/ile-conecta\.whereby\.com"$/);
  }
});
test("o site continua sem poder ser embutido por terceiros", () => {
  assert.equal(h["X-Frame-Options"], "DENY");
});

test("o endereço antigo da Vercel leva ao domínio próprio, mantendo caminho e parâmetros", () => {
  const r = cfg.redirects.find((x) => x.has?.some((h) => h.type === "host" && h.value === "ile-conecta.vercel.app"));
  assert.ok(r);
  assert.equal(r.destination, "https://ileconecta.com.br/:path");
  assert.equal(r.source, "/:path(.*)");
});
test("retornos de pagamento e cobrança usam o domínio próprio por padrão", () => {
  for (const f of ["payments", "platform-billing"]) {
    const t = readFileSync(new URL(`../supabase/functions/${f}/index.ts`, import.meta.url), "utf8");
    assert.match(t, /\?\? "https:\/\/ileconecta\.com\.br"/);
  }
});
