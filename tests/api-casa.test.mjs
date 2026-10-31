import test from "node:test";
import assert from "node:assert/strict";
import casa from "../api/casa.js";
import sitemap from "../api/sitemap.js";

const mkRes = () => ({ headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } });
const withFetch = async (rows, fn) => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (u) => { calls.push(String(u)); return { ok: true, json: async () => rows }; };
  process.env.VITE_SUPABASE_URL = "https://x.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "k";
  try { await fn(calls); } finally { globalThis.fetch = real; }
};

test("pré-visualização da casa: tags corretas e texto escapado", async () => {
  const house = [{ name: 'Casa <b>"X"</b>', category: "Candomblé", cover_url: null, offerings: null, profiles: { avatar_url: "https://a/b.png", bio: "Axé & paz", city: "Salvador", state: "BA" } }];
  await withFetch(house, async () => {
    const res = mkRes();
    await casa({ headers: { host: "ile.test" }, query: { slug: "casa-x1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /<meta property="og:title" content="Casa &lt;b&gt;&quot;X&quot;&lt;\/b&gt; · Ilê Conecta">/);
    assert.match(res.body, /og:url" content="https:\/\/ile\.test\/c\/casa-x1"/);
    assert.match(res.body, /og:image" content="https:\/\/a\/b\.png"/);
    assert.ok(!res.body.includes("<b>"));
  });
});

test("endereço inválido nem consulta o banco e devolve 404", async () => {
  await withFetch([], async (calls) => {
    const res = mkRes();
    await casa({ headers: { host: "ile.test" }, query: { slug: "../etc&x=1" } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(calls.length, 0);
  });
});

test("mapa do site lista a página inicial e cada casa", async () => {
  await withFetch([{ slug: "casa-x1", updated_at: "2026-10-30T00:00:00Z" }, { slug: "BAD SLUG", updated_at: "2026-10-30T00:00:00Z" }], async () => {
    const res = mkRes();
    await sitemap({ headers: { host: "ile.test" } }, res);
    assert.match(res.body, /<loc>https:\/\/ile\.test\/c\/casa-x1<\/loc>/);
    assert.ok(!res.body.includes("BAD"));
  });
});
