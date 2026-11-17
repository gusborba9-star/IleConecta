import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ADMIN = U(1), H1 = U(50), H2 = U(51);
const profile = { id: ADMIN, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const ev = (n, kind, o = {}) => ({ at: new Date(Date.UTC(2026, 10, 15 - n, 12)).toISOString(), kind, ref_id: U(600 + n), title: `Evento ${n}`, detail: null, amount_cents: null, status: null, ...o });
const PAGE1 = { house: { id: H1, name: "Casa Um", plan: "base", created_at: "2026-01-01T00:00:00Z" },
  to_pay: { total_cents: 7980, count: 2, charges: [
    { id: U(70), kind: "extra_seat", description: "Vaga adicional", amount_cents: 3990, due_date: "2026-12-17", status: "aberta", pix_discount_cents: 400, pix_discount_until: "2026-11-20", overdue: false },
    { id: U(71), kind: "boost", description: "Impulsionamento", amount_cents: 3990, due_date: "2026-11-10", status: "vencida", pix_discount_cents: 0, pix_discount_until: null, overdue: true }] },
  events: [ev(1, "fatura_emitida", { amount_cents: 3990, status: "aberta", title: "<img src=x onerror=window.__xss=1>" }), ev(2, "plano", { title: "Plano: gratis → base", detail: "subiu" }), ev(3, "suporte", { status: "em_analise" })],
  has_more: true, next_before: "2026-11-12T12:00:00.000Z" };
const PAGE2 = { ...PAGE1, to_pay: null, events: [ev(4, "moderacao"), ev(5, "casa_criada", { title: "Casa criada" })], has_more: false, next_before: null };
const HOUSES = [{ house_id: H1, name: "Casa Um", plan: "base" }, { house_id: H2, name: "Terreiro Dois", plan: "gratis" }];

const setup = (page, extra = {}) => api(page, {
  rest: { profiles: profile, legal_consents: [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }] },
  rpc: { is_admin: true, admin_houses_plans: HOUSES, admin_houses_seats: [], admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] },
    admin_house_timeline: (b) => (b.p_before ? PAGE2 : b.p_house === H2 ? { ...PAGE1, house: { ...PAGE1.house, id: H2, name: "Terreiro Dois" }, to_pay: null, events: [ev(9, "casa_criada")], has_more: false, next_before: null } : PAGE1), ...extra },
});

test.describe("linha do tempo da casa (administração, app inteiro)", () => {
  test("abre pela busca, mostra a pagar com Pix, eventos em ordem, filtro e 'ver mais' sem repetir", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/admin?s=usuarios");
    await expect(page.getByRole("heading", { name: "Linha do tempo da casa" })).toBeVisible();
    await page.getByLabel("Buscar casa pelo nome").fill("terreiro");
    await expect(page.getByRole("button", { name: "Casa Um" })).toHaveCount(0);
    await page.getByLabel("Buscar casa pelo nome").fill("");
    await page.getByRole("button", { name: "Casa Um" }).click();
    await expect(page).toHaveURL(new RegExp(`casa=${H1}`));
    const pay = page.getByRole("region", { name: "A pagar à plataforma" });
    await expect(pay).toContainText("R$ 79,80");
    await expect(pay).toContainText(/no Pix: R\$\s35,90 até 20\/11/);
    await expect(pay).toContainText("(vencida)");
    const items = page.getByRole("list", { name: "Eventos" }).locator("li");
    await expect(items).toHaveCount(3);
    await expect(items.first()).toContainText("Fatura emitida");
    await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(items.nth(1)).toContainText("subiu de plano");
    await expect(items.nth(2)).toContainText("em analise");
    await noHScroll(page);
    await page.getByRole("button", { name: "Ver mais antigos" }).click();
    await expect(items).toHaveCount(5);
    await expect(items.last()).toContainText("Casa criada");
    await expect(page.getByRole("button", { name: "Ver mais antigos" })).toHaveCount(0);
    await page.getByLabel("Filtrar por tipo").selectOption("plano");
    await expect(items).toHaveCount(1);
    const tl = calls.filter((c) => c.name === "admin_house_timeline");
    expect(tl.map((c) => c.body.p_before)).toEqual([null, "2026-11-12T12:00:00.000Z"]);
    expect(tl.every((c) => c.body.p_house === H1)).toBe(true);
  });
  test("link direto ?casa=<id> abre a casa; id inválido na URL é ignorado", async ({ page }) => {
    const calls = await setup(page);
    await page.goto(`/admin?s=usuarios&casa=${H2}`);
    await expect(page.locator("strong", { hasText: "Terreiro Dois" })).toBeVisible();
    await expect(page.getByText("Nada a pagar à plataforma agora.")).toBeVisible();
    const p2 = await page.context().newPage();
    const calls2 = await setup(p2);
    await p2.goto(`/admin?s=usuarios&casa=${encodeURIComponent("x' or 1=1 --")}`);
    await expect(p2.getByRole("heading", { name: "Linha do tempo da casa" })).toBeVisible();
    await p2.waitForTimeout(500);
    expect(calls2.filter((c) => c.name === "admin_house_timeline")).toHaveLength(0);
    expect(calls.length).toBeGreaterThan(0);
  });
  test("erros do servidor viram mensagem em português, sem detalhe técnico", async ({ page }) => {
    await setup(page, { admin_house_timeline: { status: 400, body: { message: "casa_inexistente" } } });
    await page.goto(`/admin?s=usuarios&casa=${H1}`);
    await expect(page.getByRole("alert")).toHaveText("Casa não encontrada.");
    const p2 = await page.context().newPage();
    await setup(p2, { admin_house_timeline: { status: 500, body: { message: "pg_catalog sqlstate 12345 stack" } } });
    await p2.goto(`/admin?s=usuarios&casa=${H1}`);
    await expect(p2.getByRole("alert")).toHaveText("Não foi possível carregar a linha do tempo.");
  });
  test("a central de pendências leva à linha do tempo da casa do item", async ({ page }) => {
    await setup(page, { admin_pending_center: { total: 1, overdue: 0, counts: { suporte: 1 }, items: [{ kind: "suporte", ref_id: U(80), house_id: H1, house_name: "Casa Um", title: "Chamado da casa", detail: "", priority: "alta", due_at: null, overdue: false, since: null, tab: "suporte" }] } });
    await page.goto("/admin");
    await page.locator("li").filter({ hasText: "Chamado da casa" }).getByRole("button", { name: "Linha do tempo da casa" }).click();
    await expect(page).toHaveURL(new RegExp(`s=usuarios&casa=${H1}`));
    await expect(page.locator("strong", { hasText: "Casa Um" })).toBeVisible();
  });
  test("reembolso da plataforma que falhou: a linha do tempo abre com o item destacado", async ({ page }) => {
    const REF = U(640);
    await setup(page, {
      admin_pending_center: { total: 1, overdue: 0, counts: { reembolso_plataforma: 1 }, items: [{ kind: "reembolso_plataforma", ref_id: REF, house_id: H1, house_name: "Casa Um", title: "Reembolso de plano de R$ 89,90", detail: "falhou", priority: "alta", due_at: null, overdue: false, since: null, tab: "cobranca" }] },
      admin_house_timeline: { ...PAGE1, events: [ev(1, "fatura_emitida"), { ...ev(2, "reembolso_plataforma", { status: "falhou", amount_cents: 8990 }), ref_id: REF }, ev(3, "suporte")], has_more: false, next_before: null },
    });
    await page.goto("/admin");
    await page.locator("li").filter({ hasText: "Reembolso de plano" }).getByRole("button", { name: "Linha do tempo da casa" }).click();
    await expect(page).toHaveURL(new RegExp(`s=usuarios&casa=${H1}&foco=${REF}`));
    await expect(page.locator(`[data-foco="${REF}"]`)).toHaveAttribute("data-focused", "true");
    await expect(page.locator(`[data-foco="${U(601)}"]`)).not.toHaveAttribute("data-focused", "true");
  });
  test("celular estreito: sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page);
    await page.goto(`/admin?s=usuarios&casa=${H1}`);
    await expect(page.locator("strong", { hasText: "Casa Um" })).toBeVisible();
    await noHScroll(page);
  });
});
