// Velocidade no celular: abre o app já compilado (dist/) num celular emulado com internet 4G lenta e processador 4 vezes mais lento
// e mede o que a pessoa sente (primeira tela, maior elemento, deslocamento de layout, bloqueio) e o peso transferido (com brotli, como na Vercel).
// Variante COM LOGIN (API simulada, sem internet). Uso: VITE_SUPABASE_URL=http://sb.test VITE_SUPABASE_ANON_KEY=anon-key-de-teste npx vite build --outDir dist-medida && node scripts/carga/celular_logado.mjs [rotas, padrão /,/descobrir,/rituais]
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { brotliCompressSync } from "node:zlib";
import { extname, join } from "node:path";
import { chromium, devices } from "playwright";
import { api, U } from "../../tests/ui/_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";
const DIST = new URL("../../dist-medida/", import.meta.url).pathname;
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const cache = new Map();
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); let f = join(DIST, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
  const ext = extname(f); let buf = cache.get(f);
  if (!buf) { buf = readFileSync(f); if ([".js", ".css", ".html", ".svg"].includes(ext)) buf = { raw: buf, br: brotliCompressSync(buf) }; else buf = { raw: buf }; cache.set(f, buf); }
  const h = { "content-type": types[ext] ?? "application/octet-stream", "cache-control": "no-store" };
  if (buf.br && String(req.headers["accept-encoding"] ?? "").includes("br")) { res.writeHead(200, { ...h, "content-encoding": "br" }); res.end(buf.br); } else { res.writeHead(200, h); res.end(buf.raw); }
});
// Aquece a compressão de todos os arquivos antes de medir: sem isso a primeira rota paga o tempo de comprimir (artefato do medidor, não do app).
for (const name of ["index.html", ...readdirSync(join(DIST, "assets")).map((n) => "assets/" + n)]) {
  const f = join(DIST, name); const ext = extname(f);
  if ([".js", ".css", ".html", ".svg"].includes(ext)) { const raw = readFileSync(f); cache.set(f, { raw, br: brotliCompressSync(raw) }); }
}
await new Promise((r) => srv.listen(0, r));
const base = `http://localhost:${srv.address().port}`;
const routes = (process.argv[2] ?? "/,/descobrir,/rituais").split(",");
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const out = [];
for (const route of routes) {
  const ctx = await browser.newContext({ ...devices["Moto G Power"] ?? devices["Pixel 5"], locale: "pt-BR" });
  const page = await ctx.newPage();
  const me = U(1);
  await api(page, { rest: { profiles: { id: me, account_type: "pessoa", display_name: "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" }, legal_consents: [{ doc_key: "termos_cliente", doc_version: LEGAL_VERSION, accepted_at: "2026-11-25T10:00:00Z" }] }, rpc: {} });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let bytes = 0, reqs = 0; const byType = {};
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; reqs++; });
  cdp.on("Network.responseReceived", (e) => { byType[e.type] = (byType[e.type] ?? 0) + 1; });
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0, fcp: 0, tbt: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
  });
  const t0 = Date.now();
  await page.goto(base + route, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const m = await page.evaluate(() => window.__m);
  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  const imgs = await page.evaluate(() => [...document.images].map((i) => ({ w: i.naturalWidth, shown: i.clientWidth, src: i.currentSrc.slice(0, 80), lazy: i.loading })).slice(0, 8));
  out.push({ rota: route, fcp_ms: Math.round(m.fcp), lcp_ms: Math.round(m.lcp), cls: Number(m.cls.toFixed(3)), bloqueio_ms: Math.round(m.tbt), transferido_kb: Math.round(bytes / 1024), requisicoes: reqs, memoria_js_mb: Math.round(heap / 1048576), imagens: imgs.length, carga_total_ms: Date.now() - t0 - 4000 });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close(); srv.close();
