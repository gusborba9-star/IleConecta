// API do Supabase simulada para os testes de tela. Nada sai para a internet.
import { expect } from "@playwright/test";
export const SESSION = { access_token: "aaa.bbb.ccc", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email: "casa@teste.app" } };
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

/** API simulada: `rpc[name]` devolve o corpo (ou {status, body}); registra as chamadas. */
export async function api(page, { rpc: rpcIn = {}, rest = {}, fn = {}, storageOk = null } = {}) {
  // Quem é administrador nos testes antigos é o dono, salvo se o teste disser outra coisa (módulos de acesso, 0138).
  const rpc = rpcIn.is_admin === true && !("admin_my_access" in rpcIn) ? { ...rpcIn, admin_my_access: { admin: true, owner: true, perms: [] } } : rpcIn;
  const calls = [];
  await page.addInitScript((s) => { try { localStorage.setItem("sb-sb-auth-token", JSON.stringify(s)); } catch { /* sem storage */ } }, SESSION);
  await page.route("http://sb.test/**", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    let body = null; try { body = req.postDataJSON(); } catch { /* sem corpo */ }
    const send = (v) => { const o = typeof v === "function" ? v(body, calls, { method: req.method(), search: url.search }) : v; const r = o && typeof o === "object" && "status" in o && "body" in o ? o : { status: 200, body: o }; return route.fulfill({ status: r.status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(r.body) }); };
    const m = url.pathname.match(/\/rest\/v1\/rpc\/(.+)$/);
    if (m) { calls.push({ kind: "rpc", name: m[1], body }); return send(rpc[m[1]] ?? (m[1] === "has_security_word" ? true : null)); } // por padrão a conta de teste já tem palavra de segurança (o aviso único não atrapalha as outras telas)
    const t = url.pathname.match(/\/rest\/v1\/(.+)$/);
    if (t) { calls.push({ kind: "rest", name: t[1], body, method: req.method(), search: url.search }); const v = rest[t[1]] ?? []; return send(req.headers()["accept"]?.includes("vnd.pgrst.object") ? (Array.isArray(v) ? v[0] ?? null : v) : v); }
    const f = url.pathname.match(/\/functions\/v1\/(.+)$/);
    if (f) { calls.push({ kind: "fn", name: f[1], body }); return send(fn[f[1]] ?? {}); }
    const st = url.pathname.match(/\/storage\/v1\/object\/(.+)$/);
    if (st) { calls.push({ kind: "storage", name: decodeURIComponent(st[1]), method: req.method(), body }); return send(storageOk ?? { Key: decodeURIComponent(st[1]) }); }
    return route.fulfill({ status: 404, headers: CORS, body: "{}" });
  });
  return calls;
}
export const noHScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
export const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

/** Abre o editor de publicação (a barra "Diga algo…" fica fechada); não faz nada se já estiver aberto. */
export const abrirEditor = async (page) => {
  const area = page.getByLabel("Texto da publicação");
  if (await area.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: /^(Diga algo à comunidade|No que você está pensando|Rascunho:)/ }).click();
  await expect(area).toBeVisible();
};
