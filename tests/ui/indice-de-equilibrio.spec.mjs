// Índice de equilíbrio da divulgação (22/11/2026): só leitura, só administração, descrição sem veredito.
import { test, expect } from "@playwright/test";
import { api, noHScroll } from "./_api.mjs";

const dados = [
  { group: "cidade:salvador/ba", houses: 3, total_views: 70, median_exposure: 10, top_exposure: 25, top_ratio: 2.5, items: [
    { house_id: "h1", name: "Casa Axé de Oxóssi e Oxum da Cidade Baixa", views: 50, active_days: 2, exposure: 25, share_pct: 71.4 },
    { house_id: "h2", name: "Casa Longe", views: 20, active_days: 2, exposure: 10, share_pct: 28.6 },
    { house_id: "h3", name: "Casa Nova", views: 0, active_days: 1, exposure: 0, share_pct: 0 } ] },
  { group: "pais:BR", houses: 1, total_views: 5, median_exposure: 5, top_exposure: 5, top_ratio: 1, items: [{ house_id: "h1", name: "Casa Axé", views: 5, active_days: 1, exposure: 5, share_pct: 100 }] },
];

for (const w of [320, 390]) {
  test(`${w}px: distribuição por alcance, frase descritiva e período`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    const calls = await api(page, { rpc: { admin_promo_equity: () => dados } });
    await page.goto("/tests/browser/ui-harness.html?c=adminequity");
    await expect(page.getByRole("heading", { name: "Equilíbrio da divulgação" })).toBeVisible();
    await expect(page.getByText("Cidade · Salvador/BA")).toBeVisible();
    await expect(page.getByText(/recebeu 2,5× a exposição mediana por dia ativo \(25 contra 10 visualizações\/dia\), com 71,4%/)).toBeVisible();
    await expect(page.getByText(/não há com o que comparar/)).toBeVisible();
    await expect(page.getByText(/desequilibr/i)).toHaveCount(0);
    await noHScroll(page);
    await page.getByRole("tab", { name: "7 dias" }).click();
    await expect.poll(() => calls.filter((c) => c.name === "admin_promo_equity").map((c) => c.body.p_days)).toContain(7);
  });
}

test("quem não é administração não vê o cartão", async ({ page }) => {
  await api(page, { rpc: { admin_promo_equity: () => ({ status: 403, body: { message: "not_admin" } }) } });
  await page.goto("/tests/browser/ui-harness.html?c=adminequity");
  await page.waitForTimeout(600);
  await expect(page.getByRole("heading", { name: "Equilíbrio da divulgação" })).toHaveCount(0);
});
