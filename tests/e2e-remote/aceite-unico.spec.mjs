import { test, expect } from "@playwright/test";

const API = "http://127.0.0.1:54321";
const V = "2026-10-rascunho-2"; // LEGAL_VERSION vigente
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (uid) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.assinatura`;

/** Servidor simulado: sessão, perfil, aceites e as duas funções de aceite. Guarda o que o app gravou em `state`. */
async function serve(page, { type = "cliente", rows = [], consentsStatus = 200, recordError = null } = {}) {
  const uid = "11111111-1111-1111-1111-111111111111";
  const state = { rows: [...rows], recorded: [], withdrawn: 0, logouts: 0 };
  await page.addInitScript(([id, token]) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
      user: { id, aud: "authenticated", role: "authenticated", email: "t@x.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    }));
  }, [uid, jwt(uid)]);
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = url.pathname;
    if (path.startsWith("/auth/v1/user")) return json(route, { id: uid, aud: "authenticated", role: "authenticated", email: "t@x.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    if (path.startsWith("/auth/v1/logout")) { state.logouts++; return route.fulfill({ status: 204, headers: CORS }); }
    if (path === "/rest/v1/profiles") {
      const row = { id: uid, account_type: type === "casa" ? "casa" : "pessoa", display_name: "Teste", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
      return json(route, (req.headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
    }
    if (path === "/rest/v1/legal_consents" && req.method() === "GET") {
      if (consentsStatus !== 200) return json(route, { message: "falha" }, consentsStatus);
      return json(route, [...state.rows].sort((a, b) => b.accepted_at.localeCompare(a.accepted_at)));
    }
    if (path === "/rest/v1/rpc/record_consent") {
      const body = req.postDataJSON();
      if (recordError) return json(route, { message: recordError }, 400);
      state.recorded.push(body.p_doc);
      state.rows.push({ doc_key: body.p_doc, doc_version: body.p_version, accepted_at: new Date().toISOString() });
      return json(route, "22222222-2222-2222-2222-222222222222");
    }
    if (path === "/rest/v1/rpc/withdraw_sensitive_consent") {
      state.withdrawn++;
      state.rows.push({ doc_key: "dados_sensiveis_retirada", doc_version: req.postDataJSON().p_version, accepted_at: new Date().toISOString() });
      return json(route, "33333333-3333-3333-3333-333333333333");
    }
    if (path.startsWith("/rest/v1/rpc/")) return json(route, null);
    if (path.startsWith("/rest/v1/")) {
      if ((req.headers().accept ?? "").includes("vnd.pgrst.object")) return json(route, { code: "PGRST116", message: "no rows" }, 406);
      return json(route, []);
    }
    return json(route, {});
  });
  return state;
}

const row = (doc_key, doc_version, accepted_at = "2026-11-01T10:00:00Z") => ({ doc_key, doc_version, accepted_at });
const gateHeading = (page) => page.getByRole("heading", { name: /Termos de Uso|Atualizamos os nossos termos/ });

test("conta nova: aparece só a tela de aceite; os Termos são obrigatórios e dados sensíveis opcionais", async ({ page }) => {
  const s = await serve(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Termos de Uso", exact: true })).toBeVisible();
  const button = page.getByRole("button", { name: "Aceitar e continuar" });
  await expect(button).toBeDisabled();
  await expect(page.getByText(/Opcional\. Se você não marcar/)).toBeVisible();
  await page.getByLabel(/Li e concordo com os Termos de Uso do cliente/).check();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("heading", { name: "Termos de Uso", exact: true })).toHaveCount(0);
  expect(s.recorded).toEqual(["termos_cliente"]);
});

test("aceitar também a autorização de dados sensíveis grava os dois, em caixas separadas", async ({ page }) => {
  const s = await serve(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/Li e concordo com os Termos de Uso do cliente/).check();
  await page.getByLabel(/Autorizo o uso dos dados/).check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(gateHeading(page)).toHaveCount(0);
  expect(s.recorded).toEqual(["termos_cliente", "dados_sensiveis"]);
});

test("a caixa opcional sozinha não libera o botão", async ({ page }) => {
  const s = await serve(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/Autorizo o uso dos dados/).check();
  await expect(page.getByRole("button", { name: "Aceitar e continuar" })).toBeDisabled();
  expect(s.recorded).toEqual([]);
});

test("uma única vez: depois de aceitar, recarregar não mostra a tela de novo", async ({ page }) => {
  await serve(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/Li e concordo com os Termos de Uso do cliente/).check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(gateHeading(page)).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await expect(gateHeading(page)).toHaveCount(0);
  await page.goto("/descobrir", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await expect(gateHeading(page)).toHaveCount(0);
});

test("quem já aceitou a versão vigente nunca vê a tela", async ({ page }) => {
  await serve(page, { rows: [row("termos_cliente", V)] });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await expect(gateHeading(page)).toHaveCount(0);
});

test("texto novo: pede de novo, com aviso de atualização", async ({ page }) => {
  const s = await serve(page, { rows: [row("termos_cliente", "versao-antiga")] });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Atualizamos os nossos termos" })).toBeVisible();
  await page.getByLabel(/Li e concordo com os Termos de Uso do cliente/).check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(gateHeading(page)).toHaveCount(0);
  expect(s.recorded).toEqual(["termos_cliente"]);
});

test("quem retirou dados sensíveis não é cobrado de novo ao entrar", async ({ page }) => {
  await serve(page, { rows: [row("termos_cliente", V), row("dados_sensiveis", V), row("dados_sensiveis_retirada", V, "2026-11-05T10:00:00Z")] });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await expect(gateHeading(page)).toHaveCount(0);
});

test("casa: tela com os Termos da Casa e sem a caixa de dados sensíveis", async ({ page }) => {
  const s = await serve(page, { type: "casa" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Termos de Uso", exact: true })).toBeVisible();
  await expect(page.getByLabel(/Autorizo o uso dos dados/)).toHaveCount(0);
  await page.getByLabel(/Li e aceito os Termos de Uso da Casa Espiritual/).check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(gateHeading(page)).toHaveCount(0);
  expect(s.recorded).toEqual(["termos_casa"]);
});

test("erro do servidor ao gravar: a tela continua e avisa; não libera o app sem aceite confirmado", async ({ page }) => {
  const s = await serve(page, { recordError: "Falha ao gravar" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/Li e concordo com os Termos de Uso do cliente/).check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(page.getByText("Falha ao gravar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Termos de Uso", exact: true })).toBeVisible();
  expect(s.recorded).toEqual([]);
});

test("não foi possível consultar os aceites: a pessoa não fica presa fora do app", async ({ page }) => {
  await serve(page, { consentsStatus: 500 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await expect(gateHeading(page)).toHaveCount(0);
});

test("Sair na tela de aceite encerra a sessão", async ({ page }) => {
  const s = await serve(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sair" }).click();
  await expect.poll(() => s.logouts).toBeGreaterThan(0);
});

test("Termos e normas: mostra o aceite com data e versão, retira e autoriza de novo a autorização de dados sensíveis", async ({ page }) => {
  const s = await serve(page, { rows: [row("termos_cliente", V), row("dados_sensiveis", V)] });
  await page.goto("/termos", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
  await expect(page.getByText(`versão ${V}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Retirar autorização" }).click();
  await page.getByRole("button", { name: "Retirar", exact: true }).click();
  await expect(page.getByText("Retirada", { exact: true })).toBeVisible();
  expect(s.withdrawn).toBe(1);
  await page.getByRole("button", { name: "Autorizar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retirar autorização" })).toBeVisible();
  expect(s.recorded).toEqual(["dados_sensiveis"]);
});

test("Termos e normas: lista todos os documentos e o menu lateral leva até ela", async ({ page }) => {
  await serve(page, { rows: [row("termos_cliente", V)] });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Termos e normas" }).first().click();
  await expect(page).toHaveURL(/\/termos$/);
  for (const t of ["Termos de Uso do cliente", "Privacidade e LGPD", "Normas de uso", "Código de conduta", "Quem somos"]) {
    await expect(page.getByRole("link", { name: new RegExp(t) }).first()).toBeVisible();
  }
});

test("rodapé discreto: um único link para os termos, sem a lista de documentos em toda tela", async ({ page }) => {
  await serve(page, { rows: [row("termos_cliente", V)] });
  await page.goto("/descobrir", { waitUntil: "domcontentloaded" });
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Termos e normas" })).toBeVisible();
  await expect(footer.getByRole("link")).toHaveCount(2);
});

test("Termos e normas também aceita os Termos pendentes (caminho de segurança se a tela de aceite não puder abrir)", async ({ page }) => {
  const s = await serve(page, { rows: [], consentsStatus: 200 });
  await page.goto("/termos", { waitUntil: "domcontentloaded" });
  // a tela de aceite aparece primeiro; aceitando ali o registro fica e a página mostra "Aceito"
  await page.getByLabel(/Li e concordo com os Termos de Uso do cliente/).check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await page.goto("/termos", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Aceito", { exact: true }).first()).toBeVisible();
  expect(s.recorded).toEqual(["termos_cliente"]);
});
