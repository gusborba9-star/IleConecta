// Avisos do sistema (toasts) com visual premium (21/11/2026): cartão com faixa de cor, ícone em círculo, botão de fechar em português, nos dois temas.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1);
const casa = { id: ME, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_casa"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const house = { id: U(9), owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };

const disparar = (page, tipo, titulo, descricao) => page.evaluate(async ([t, a, b]) => {
  const url = performance.getEntriesByType("resource").map((r) => r.name).find((n) => /deps\/sonner\.js/.test(n));
  const { toast } = await import(url.split("?")[0] + (url.includes("?") ? "?" + url.split("?")[1] : ""));
  toast[t](a, b ? { description: b } : undefined);
}, [tipo, titulo, descricao]);

for (const tema of ["light", "dark"]) {
  test(`avisos nos 4 tipos, tema ${tema}: cartão, ícone, faixa de cor e fechar em português`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.emulateMedia({ colorScheme: tema });
    await api(page, { rest: { profiles: casa, legal_consents: consents, houses: [house] }, rpc: {} });
    await page.goto("/");
    await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), tema);
    await disparar(page, "success", "Boas-vindas, Gezebel!", "Boa noite.");
    await disparar(page, "error", "Não foi possível salvar. Tente novamente.");
    await disparar(page, "warning", "Atenção: a casa está offline.");
    await disparar(page, "info", "Link da página copiado.");
    const avisos = page.locator("[data-sonner-toast]");
    await expect(avisos).toHaveCount(4);
    for (const a of await avisos.all()) {
      const caixa = await a.boundingBox();
      expect(caixa.x).toBeGreaterThanOrEqual(8);
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(375 - 8);
      // fundo de cartão (não a cor chapada de antes) e canto bem arredondado
      const css = await a.evaluate((e) => { const c = getComputedStyle(e); return { fundo: c.backgroundColor, raio: parseFloat(c.borderTopLeftRadius) }; });
      expect(css.raio).toBeGreaterThanOrEqual(14);
      expect(css.fundo).not.toBe("rgba(0, 0, 0, 0)");
      await expect(a.locator("[data-icon]")).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Fechar aviso" })).toHaveCount(4);
    await expect(page.getByRole("button", { name: /Close toast/ })).toHaveCount(0);
    await expect(page.getByText("Boas-vindas, Gezebel!")).toBeVisible();
    await page.screenshot({ path: `/tmp/claude-0/-home-claude/d4c4e1c6-a1f4-513a-856c-f3b1adeb3b8d/scratchpad/avisos-${tema}.png` });
    await page.getByRole("button", { name: "Fechar aviso" }).first().click();
    await expect(avisos).toHaveCount(3);
    await noHScroll(page);
  });
}
