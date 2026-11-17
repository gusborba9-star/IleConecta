import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1);
const profile = { id: OWNER, account_type: "cliente", display_name: "Pessoa Teste", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-11-01T10:00:00Z" };
const consents = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "dados_sensiveis", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }];
const setup = (page) => api(page, { rest: { profiles: profile, legal_consents: consents, houses: [], posts: [] } });

test.describe("carregamento por tela", () => {
  test("a tela de uma rota separada abre e mostra o conteúdo", async ({ page }) => {
    await setup(page);
    await page.goto("/termos");
    await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
  });

  test("navegar pelo menu entre telas separadas continua funcionando", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.goto("/descobrir");
    await expect(page.locator("main, [role=main], body")).toBeVisible();
    await page.goto("/termos");
    await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
  });

  test("se o arquivo da tela não chega, aparece o aviso com 'Tentar de novo' (sem tela em branco e sem recarregar sem parar)", async ({ page }) => {
    await setup(page);
    let docs = 0;
    page.on("request", (r) => { if (r.resourceType() === "document") docs++; });
    await page.route(/\/src\/pages\/Terms\.tsx/, (route) => route.abort());
    await page.goto("/termos");
    await expect(page.getByRole("alert")).toContainText("Não foi possível abrir esta tela");
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(docs).toBeLessThanOrEqual(2); // no máximo uma recarga automática
  });

  test("'Tentar de novo' abre a tela quando o arquivo volta a chegar", async ({ page }) => {
    await setup(page);
    let bloquear = true;
    await page.route(/\/src\/pages\/Terms\.tsx/, (route) => (bloquear ? route.abort() : route.continue()));
    await page.goto("/termos");
    await expect(page.getByRole("alert")).toBeVisible();
    bloquear = false;
    await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* ok */ } });
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
  });
});
