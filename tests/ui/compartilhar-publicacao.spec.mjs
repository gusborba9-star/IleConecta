import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const OWNER = U(1), HID = U(60), POST = U(901);
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-7", accepted_at: "2026-11-01T10:00:00Z" }];
const house = { id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "gratis", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
const post = { id: POST, house_id: HID, kind: "geral", content: "Gira de abertura", image_url: null, card_style: null, card_image_path: null, card_scrim: 55, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: OWNER }, post_likes: [], post_comments: [] };
const setup = (page) => api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house], posts: [post] }, rpc: { post_like_counts: [] } });

test.describe("compartilhar publicação", () => {
  test("celular (360 px): os 3 botões cabem numa linha só, sem 'indisponível'", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page);
    await page.goto("/comunidade");
    const card = page.locator(`#post-${POST}`);
    await expect(card.getByRole("button", { name: "Compartilhar" })).toBeEnabled();
    await expect(card.getByText("indisponível")).toHaveCount(0);
    for (const n of ["Curtir", "Comentar", "Compartilhar"]) {
      const b = await card.getByRole("button", { name: n, exact: true }).boundingBox();
      expect(b.height).toBeLessThanOrEqual(48); // uma linha: antes quebrava em duas
      expect(b.height).toBeGreaterThanOrEqual(43);
    }
    await noHScroll(page);
  });

  test("sem menu de compartilhar (computador): copia o link do post e avisa", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setup(page);
    await page.goto("/comunidade");
    await page.addInitScript(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
    await page.reload();
    await page.locator(`#post-${POST}`).getByRole("button", { name: "Compartilhar" }).click();
    await expect(page.getByText("Link copiado.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://127.0.0.1:4174/comunidade?post=${POST}`);
  });

  test("celular com menu de compartilhar: usa o menu com título e link; fechar o menu não é erro", async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared.push(d); return window.__shared.length === 2 ? Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })) : Promise.resolve(); } });
    });
    await setup(page);
    await page.goto("/comunidade");
    const btn = page.locator(`#post-${POST}`).getByRole("button", { name: "Compartilhar" });
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const d = await page.evaluate(() => window.__shared[0]);
    expect(d.url).toBe(`http://127.0.0.1:4174/comunidade?post=${POST}`);
    expect(d.title).toContain("Casa Axé");
    expect(JSON.stringify(d)).not.toMatch(/Gira de abertura/); // o texto do post não vai no compartilhamento
    await btn.click(); // 2º: a pessoa fecha o menu (AbortError)
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2);
    await expect(page.getByText("Não foi possível copiar o link.")).toHaveCount(0);
    await expect(page.getByText("Link copiado.")).toHaveCount(0);
  });
});
