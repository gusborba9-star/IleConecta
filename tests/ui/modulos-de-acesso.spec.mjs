import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), ANA = U(2), BIA = U(3);
const profile = { id: ME, account_type: "pessoa", display_name: "Eu", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-6", accepted_at: "2026-11-01T10:00:00Z" }];
const TEAM = [
  { user_id: ME, email: "dono@x.com", name: "Gustavo", owner: true, perms: [], created_at: "2026-01-01T00:00:00Z" },
  { user_id: ANA, email: "ana@x.com", name: "Ana <b>Suporte</b>", owner: false, perms: ["suporte"], created_at: "2026-02-01T00:00:00Z" },
  { user_id: BIA, email: "bia@x.com", name: "", owner: false, perms: [], created_at: "2026-03-01T00:00:00Z" },
];
const base = { is_admin: true, admin_houses_plans: [], admin_houses_seats: [], admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_support_queue: [], admin_audit_feed: [], admin_moderation_list: [], admin_chat_reports: [], admin_reported_reviews: [] };
const setup = (page, access, extra = {}) => api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { ...base, admin_my_access: { admin: true, ...access }, ...extra } });
const tabs = (page) => page.getByRole("navigation", { name: "Seções do painel" }).getByRole("button");

test.describe("módulos de acesso da administração (app inteiro)", () => {
  test("dono vê todas as seções e a equipe, com módulos", async ({ page }) => {
    await setup(page, { owner: true, perms: [] }, { admin_list_admins: TEAM });
    await page.goto("/admin?s=usuarios");
    await expect(tabs(page)).toHaveText(["Visão geral", "Reembolsos", "Suporte", "Usuários", "Configurações", "Documentos", "Histórico"]);
    const team = page.getByRole("list", { name: "Equipe" }).locator("li");
    await expect(team).toHaveCount(3);
    await expect(team.nth(0)).toContainText("Dono");
    await expect(team.nth(1)).toContainText("Atender chamados");
    await expect(team.nth(1)).toContainText("Ana <b>Suporte</b>"); // texto hostil fica como texto
    await expect(team.nth(2)).toContainText("Sem nenhum módulo");
    await noHScroll(page);
  });

  test("dono marca módulos e salva: o servidor recebe exatamente a lista; adicionar manda e-mail e módulos", async ({ page }) => {
    const calls = await setup(page, { owner: true, perms: [] }, { admin_list_admins: TEAM, admin_set_admin_perms: null, admin_add_admin: null });
    await page.goto("/admin?s=usuarios");
    const bia = page.getByRole("list", { name: "Equipe" }).locator("li").nth(2);
    await bia.getByRole("button", { name: "Módulos" }).click();
    await bia.getByLabel(/Verificar infrações/).check();
    await bia.getByLabel(/Ver números/).check();
    await bia.getByRole("button", { name: "Salvar módulos" }).click();
    await expect.poll(() => calls.filter((c) => c.name === "admin_set_admin_perms").length).toBe(1);
    expect(calls.find((c) => c.name === "admin_set_admin_perms").body).toEqual({ p_user: BIA, p_perms: ["moderacao", "indicadores"] });
    await page.getByLabel("E-mail da nova pessoa da equipe").fill("nova@x.com");
    await page.getByLabel(/Comunicados e contato/).last().check();
    await page.getByRole("button", { name: "Adicionar à equipe" }).click();
    await expect.poll(() => calls.filter((c) => c.name === "admin_add_admin").length).toBe(1);
    expect(calls.find((c) => c.name === "admin_add_admin").body).toEqual({ p_email: "nova@x.com", p_perms: ["comunicacao"] });
  });

  test("o dono não tem botão de tirar nem de editar módulos em si", async ({ page }) => {
    await setup(page, { owner: true, perms: [] }, { admin_list_admins: TEAM });
    await page.goto("/admin?s=usuarios");
    const me = page.getByRole("list", { name: "Equipe" }).locator("li").first();
    await expect(me.getByRole("button")).toHaveCount(0);
  });

  test("atendente (só suporte): só a aba Suporte; endereços de outras seções caem nela; sem equipe, sem e-mail de suporte, sem suspender", async ({ page }) => {
    await setup(page, { owner: false, perms: ["suporte"] });
    await page.goto("/admin?s=historico");
    await expect(tabs(page)).toHaveText(["Suporte"]);
    await expect(page).toHaveURL(/s=historico/); // a URL fica, mas o conteúdo é o da seção permitida
    await expect(page.getByText("Histórico de alterações")).toHaveCount(0);
    for (const s of ["config", "docs", "reembolsos", "usuarios", ""]) {
      await page.goto(s ? `/admin?s=${s}` : "/admin");
      await expect(tabs(page)).toHaveText(["Suporte"]);
      await expect(page.getByRole("heading", { name: "Equipe da administração" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Documentos" })).toHaveCount(0);
    }
  });

  test("moderador: só Configurações, e nela só os cartões de moderação (nada de preços, planos, cobrança)", async ({ page }) => {
    await setup(page, { owner: false, perms: ["moderacao"] });
    await page.goto("/admin?s=config");
    await expect(tabs(page)).toHaveText(["Configurações"]);
    await expect(page.getByRole("heading", { name: /Moderação de anúncios/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Denúncias do chat/ })).toBeVisible();
    for (const h of ["Funcionalidades", "Planos: ferramentas, limites e textos", "Alcance por região"]) await expect(page.getByRole("heading", { name: h })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Comunicados" })).toHaveCount(0);
  });

  test("números (só leitura): Visão geral e Usuários com linha do tempo, sem equipe", async ({ page }) => {
    await setup(page, { owner: false, perms: ["indicadores"] });
    await page.goto("/admin?s=usuarios");
    await expect(tabs(page)).toHaveText(["Visão geral", "Usuários"]);
    await expect(page.getByRole("heading", { name: "Linha do tempo da casa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Equipe da administração" })).toHaveCount(0);
  });

  test("equipe sem nenhum módulo: aviso claro, nenhuma seção", async ({ page }) => {
    await setup(page, { owner: false, perms: [] });
    await page.goto("/admin");
    await expect(tabs(page)).toHaveCount(0);
    await expect(page.getByText(/ainda não recebeu nenhum módulo/)).toBeVisible();
  });

  test("falha ao ler o acesso: nada é liberado por engano", async ({ page }) => {
    await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { ...base, admin_my_access: { status: 500, body: { message: "boom" } } } });
    await page.goto("/admin");
    await expect(tabs(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Equipe da administração" })).toHaveCount(0);
  });

  test("pessoa comum: área restrita", async ({ page }) => {
    await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: false, admin_my_access: { admin: false, owner: false, perms: [] } } });
    await page.goto("/admin");
    await expect(page.getByText("Área restrita à administração.")).toBeVisible();
  });
});
