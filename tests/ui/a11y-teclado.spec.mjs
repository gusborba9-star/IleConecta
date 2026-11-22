// Acessibilidade por teclado: todo elemento que recebe foco mostra um indicador visível (contorno ou sombra).
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const profile = { id: U(1), account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis", "termos_casa"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-11", accepted_at: "2026-11-01T10:00:00Z" }));

const semIndicador = async (page, max) => {
  const ruins = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const s = getComputedStyle(e);
      const temContorno = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      const temSombra = s.boxShadow && s.boxShadow !== "none";
      const pai = e.closest("[data-focus-ring]");
      const rect = e.getBoundingClientRect();
      return { ok: temContorno || temSombra || Boolean(pai), tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 90), txt: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30), visivel: rect.width > 0 && rect.height > 0 };
    });
    if (r && r.visivel && !r.ok) ruins.push(r);
  }
  return ruins;
};

for (const [nome, tela] of [["login", "/login"], ["cadastro", "/register"], ["inicio", "/"], ["descobrir", "/descobrir"], ["planos", "/planos"], ["suporte", "/suporte"], ["comunidade (Momentos)", "/comunidade"], ["termos", "/termos"], ["créditos de áudio", "/creditos-de-audio"], ["chamados", "/suporte/chamados"], ["administração", "/admin"], ["administração: suporte", "/admin?s=suporte"], ["página inexistente", "/nao-existe-mesmo"]]) {
  test(`foco visível ao navegar por Tab: ${nome}`, async ({ page }) => {
    if (tela !== "/login" && tela !== "/register") await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, music_credits: [] } });
    await page.goto(tela);
    await page.waitForTimeout(800);
    expect(await semIndicador(page, 40)).toEqual([]);
  });
}

test("controle: o teste percebe quando o indicador de foco some", async ({ page }) => {
  await page.goto("/login");
  await page.addStyleTag({ content: "*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }" });
  await page.waitForTimeout(500);
  expect((await semIndicador(page, 12)).length).toBeGreaterThan(0);
});

test.describe("pular para o conteúdo e título por tela", () => {
  test("o primeiro Tab é 'Ir para o conteúdo', fica visível e leva o foco ao conteúdo", async ({ page }) => {
    await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] } } });
    await page.goto("/planos");
    await page.waitForTimeout(600);
    await page.keyboard.press("Tab");
    const link = page.getByRole("link", { name: "Ir para o conteúdo" });
    await expect(link).toBeFocused();
    await expect(link).toBeVisible();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("conteudo");
    expect(await page.evaluate(() => location.hash)).toBe("");
  });
  test("o título da aba muda a cada tela e a troca é anunciada; a primeira carga não é anunciada duas vezes", async ({ page }) => {
    await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] } } });
    await page.goto("/planos");
    await expect(page).toHaveTitle("Planos e faturas · Ilê Conecta");
    expect(await page.getByRole("status").filter({ hasText: "Página:" }).count()).toBe(0);
    await page.goto("/suporte");
    await expect(page).toHaveTitle("Suporte · Ilê Conecta");
    await page.getByRole("link", { name: /Casas/ }).first().click();
    await expect(page).toHaveTitle("Casas · Ilê Conecta");
    await expect(page.getByRole("status").filter({ hasText: "Página: Casas" })).toHaveCount(1);
  });
});

test.describe("janelas e listas sobrepostas", () => {
  const login = (page, extra = {}) => api(page, { rest: { profiles: profile, legal_consents: consents, notifications: [], ...extra }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] } } });
  test("sino de notificações: abre com Enter, anuncia expandido e fecha com Esc", async ({ page }) => {
    await login(page);
    await page.goto("/planos");
    const sino = page.getByRole("button", { name: /^Notificações/ });
    await sino.focus();
    await page.keyboard.press("Enter");
    await expect(sino).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: "Notificações" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sino).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("region", { name: "Notificações" })).toHaveCount(0);
  });
});
