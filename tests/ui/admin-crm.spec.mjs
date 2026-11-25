// Painel da administração como CRM: início com blocos, menu lateral (computador), barra de ícones (celular), uma tela por assunto com Voltar,
// busca que abre a tela direto (sem rolar), links antigos e permissões. API simulada; nada sai para a internet.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";
import { ADMIN_SCREENS } from "../../src/lib/adminNavCore.js";

const profile = { id: U(1), account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }));
const rpc = (extra = {}) => ({ is_admin: true, admin_pending_center: { total: 4, overdue: 1, counts: {}, items: [] }, admin_health: null, admin_moment_reports: [], music_credits: [], ...extra });
const setup = (page, extra) => api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [] }, rpc: rpc(extra) });
const menu = (page) => page.getByRole("navigation", { name: "Módulos do painel" });
const bar = (page) => page.getByRole("navigation", { name: "Atalhos do painel" });
const H1 = (page) => page.locator("main h1, h1").first();
const MOBILE = { width: 375, height: 740 };

test.describe("computador", () => {
  test("início: um bloco por módulo, menu lateral, pendências e nenhuma barra de baixo", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Painel da administração" })).toBeVisible();
    await expect(menu(page)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    for (const nome of ["Números e saúde", "Suporte", "Reembolsos", "Usuários", "Plataforma e planos", "Equipe e contas", "Moderação", "Comunicação", "Dinheiro e preços", "Assistente e alcance", "Documentos", "Histórico"])
      await expect(page.locator("main").getByRole("link", { name: new RegExp(`^${nome}`) }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Pendências da administração/ })).toContainText("4 no total · 1 vencida");
    await noHScroll(page);
  });

  test("módulo → tela → Voltar → Voltar: cada passo é uma tela só, com endereço próprio", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await page.locator("main").getByRole("link", { name: /^Dinheiro e preços/ }).first().click();
    await expect(page).toHaveURL(/\?s=dinheiro$/);
    await expect(page.getByRole("heading", { name: "Dinheiro e preços", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Taxas da plataforma/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Funcionalidades" })).toHaveCount(0); // nada de outro módulo na mesma tela
    await page.getByRole("link", { name: /^Taxas da plataforma/ }).click();
    await expect(page).toHaveURL(/\?s=dinheiro&c=taxas$/);
    await expect(page.locator("h1")).toHaveText("Taxas da plataforma");
    await expect(page.getByRole("heading", { name: "Taxas da plataforma", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Teto por pagamento" })).toHaveCount(0); // um assunto por tela
    await expect(menu(page).getByRole("link", { name: "Dinheiro e preços" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\?s=dinheiro$/);
    await page.getByRole("link", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Painel da administração" })).toBeVisible();
  });

  test("módulo de uma tela só abre direto nela e o Voltar vai ao início", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await menu(page).getByRole("link", { name: "Histórico" }).click();
    await expect(page).toHaveURL(/\?s=historico$/);
    await expect(page.locator("h1")).toHaveText("Histórico de alterações");
    await page.getByRole("link", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("busca abre a tela direto (sem acento ou maiúscula), por clique e por teclado, e a página começa no topo", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    const busca = page.getByRole("searchbox", { name: "Buscar uma tela do painel" });
    await busca.fill("MUSICA");
    await page.getByRole("option", { name: /Biblioteca de músicas/ }).getByRole("button").click();
    await expect(page).toHaveURL(/\?s=moderacao&c=musicas$/);
    await expect(page.locator("h1")).toHaveText("Biblioteca de músicas");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.goto("/admin");
    await page.getByRole("searchbox", { name: "Buscar uma tela do painel" }).fill("teto");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Buscar uma tela do painel" }).press("Enter");
    await expect(page).toHaveURL(/\?s=dinheiro&c=teto$/);
    await page.goto("/admin");
    await page.getByRole("searchbox", { name: "Buscar uma tela do painel" }).fill("xyzxyz");
    await expect(page.getByText("Nenhuma tela com esse termo.")).toBeVisible();
  });

  test("endereços antigos: ?s=config abre Plataforma e planos; ?s=visao, módulo inexistente e tela de outro módulo caem onde devem", async ({ page }) => {
    await setup(page);
    await page.goto("/admin?s=config");
    await expect(page.getByRole("heading", { name: "Plataforma e planos", level: 1 })).toBeVisible();
    await page.goto("/admin?s=visao");
    await expect(page.getByRole("heading", { name: "Painel da administração" })).toBeVisible();
    await page.goto("/admin?s=nada&c=x");
    await expect(page.getByRole("heading", { name: "Painel da administração" })).toBeVisible();
    await page.goto("/admin?s=dinheiro&c=suporte");
    await expect(page.getByRole("heading", { name: "Dinheiro e preços", level: 1 })).toBeVisible();
  });

  test("a tela de preços mostra só o seu salvar (nada de alcance ou funcionalidades junto)", async ({ page }) => {
    await setup(page);
    await page.goto("/admin?s=dinheiro&c=precos");
    await expect(page.getByRole("heading", { name: "Preços (R$)", level: 2 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar preços" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar alcance" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar Funcionalidades" })).toHaveCount(0);
  });
});

test("toda tela do mapa abre, mostra um título visível, o h1 certo, o Voltar e nenhum erro de página", async ({ page }) => {
  test.setTimeout(240000);
  const erros = [];
  let atual = "";
  page.on("pageerror", (e) => erros.push(`${atual}: ${e.message}`));
  await setup(page);
  for (const t of ADMIN_SCREENS) {
    atual = t.id;
    await page.goto(`/admin?s=${t.module}&c=${t.id}`);
    await expect(page.locator("h1").first(), t.id).toHaveText(t.title);
    await expect(page.locator("[data-screen] h2, [data-screen] h3, [data-screen] > *").first(), `${t.id}: sem título visível`).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("link", { name: "Voltar" }), t.id).toBeVisible();
  }
  expect(erros).toEqual([]);
});

test.describe("celular", () => {
  test.use({ viewport: MOBILE });

  test("sem abas no topo e sem menu lateral: barra de ícones embaixo, com Início, atalhos e Mais", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await expect(menu(page)).toBeHidden();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page).getByRole("link")).toHaveText(["Início", "Suporte", "Usuários", "Moderação"]);
    await expect(bar(page).getByRole("button", { name: "Mais" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Seções do painel" })).toHaveCount(0);
    await noHScroll(page);
  });

  test("toque no ícone abre a tela do módulo; a barra continua e marca onde a pessoa está", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await bar(page).getByRole("link", { name: "Moderação" }).click();
    await expect(page).toHaveURL(/\?s=moderacao$/);
    await expect(bar(page).getByRole("link", { name: "Moderação" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: /^Denúncias do chat/ }).click();
    await expect(page.locator("h1")).toHaveText("Denúncias do chat");
    await expect(bar(page)).toBeVisible();
    await page.getByRole("link", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\?s=moderacao$/);
    await noHScroll(page);
  });

  test("'Mais' abre todos os módulos, leva ao escolhido e fecha; Esc também fecha", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await bar(page).getByRole("button", { name: "Mais" }).click();
    const dlg = page.getByRole("dialog", { name: "Todos os módulos" });
    await expect(dlg.getByRole("link")).toHaveCount(12);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await bar(page).getByRole("button", { name: "Mais" }).click();
    await dlg.getByRole("link", { name: /^Dinheiro e preços/ }).click();
    await expect(page).toHaveURL(/\?s=dinheiro$/);
    await expect(dlg).toHaveCount(0);
  });

  test("a tela de um cartão longo (Funcionalidades) não estoura a largura e a barra não cobre o botão final", async ({ page }) => {
    await setup(page);
    await page.goto("/admin?s=plataforma&c=funcionalidades");
    await expect(page.locator("h1")).toHaveText("Funcionalidades");
    await noHScroll(page);
    const salvar = page.getByRole("button", { name: /^Salvar/ }).last();
    await salvar.scrollIntoViewIfNeeded();
    const [b, nav] = await Promise.all([salvar.boundingBox(), bar(page).boundingBox()]);
    expect(b.y + b.height).toBeLessThanOrEqual(nav.y + 1);
  });

  test("busca no celular abre direto a tela, sem rolar a página inteira", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await page.getByRole("searchbox", { name: "Buscar uma tela do painel" }).fill("reajuste");
    await page.getByRole("option", { name: /Atualização da tabela comercial/ }).getByRole("button").click();
    await expect(page).toHaveURL(/\?s=dinheiro&c=reajuste$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("h1")).toHaveText("Atualização da tabela comercial");
  });
});

test.describe("equipe com poucos módulos (celular)", () => {
  test.use({ viewport: MOBILE });
  test("só suporte: a barra tem Início, Suporte e Mais; o resto do menu não aparece", async ({ page }) => {
    await setup(page, { admin_my_access: { admin: true, owner: false, perms: ["suporte"] } });
    await page.goto("/admin");
    await expect(bar(page).getByRole("link")).toHaveText(["Início", "Suporte"]);
    await bar(page).getByRole("button", { name: "Mais" }).click();
    await expect(page.getByRole("dialog", { name: "Todos os módulos" }).getByRole("link")).toHaveCount(1);
  });
});
