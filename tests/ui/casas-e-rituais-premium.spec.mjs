// Descobrir casas e Rituais com o acabamento Premium (21/11/2026): busca em pílula, filtros em faixa, cartões completos no celular.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Ana", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const NOME = "Ilê Axé Opô Afonjá de Oxóssi e Oxum da Cidade Baixa";
const casa = { id: U(80), account_type: "casa", display_name: NOME, avatar_url: null, bio: "Casa de tradição com mais de cinquenta anos de história e acolhimento.", city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const houseRow = { id: U(81), owner_id: U(80), name: NOME, category: "Candomblé Ketu", tags: [], cover_url: null, verified: true, offerings: "", plan: "gratis", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: casa.bio } };
const daqui2dias = new Date(Date.now() + 2 * 86_400_000).toISOString();
const evento = { id: U(90), house_id: U(81), title: "Ritual da Prosperidade", description: "x", price_cents: 8000, seats_total: 20, mode: "presencial", starts_at: daqui2dias, duration_min: 90, status: "publicado", started_at: null, intake_fields: [], houses: { owner_id: U(80), name: NOME } };

const montar = (page) => api(page, { rest: { profiles: pessoa, houses: [houseRow], events: [evento], legal_consents: consents, platform_settings: [] }, rpc: { event_taken: 3, report_client_error: true } });

for (const w of [320, 390]) {
  test(`Descobrir, ${w}px: busca em pílula, filtros em faixa, nome da casa completo e anel simétrico`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await montar(page);
    await page.goto("/descobrir");
    await expect(page.getByRole("textbox", { name: "Buscar casas" })).toBeVisible();
    const faixa = page.getByRole("group", { name: "Filtrar por tradição" });
    await expect(faixa).toBeVisible();
    expect((await faixa.boundingBox()).height).toBeLessThan(60); // uma linha só, rolando para o lado
    const nome = page.getByText(NOME).first();
    await expect(nome).toBeVisible();
    const cortado = await nome.evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    expect(cortado).toBe(false);
    const anel = page.locator("div.ring-gold\\/60").first();
    const c = await anel.boundingBox(); const i = await anel.locator("> *").first().boundingBox();
    const f = [i.x - c.x, c.x + c.width - (i.x + i.width), i.y - c.y, c.y + c.height - (i.y + i.height)];
    for (const x of f) expect(Math.abs(x - f[0])).toBeLessThan(1.5);
    await page.getByRole("button", { name: "Umbanda", exact: true }).click();
    await expect(page.getByRole("button", { name: "Umbanda", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Ver todas as casas" })).toBeVisible();
    await page.getByRole("button", { name: "Ver todas as casas" }).click();
    await expect(page.getByText(NOME).first()).toBeVisible();
    await noHScroll(page);
  });

  test(`Rituais, ${w}px: cartão com data, vagas, preço e botão Ver e reservar`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await montar(page);
    await page.goto("/rituais");
    await expect(page.getByRole("textbox", { name: "Buscar rituais" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Próximos rituais das casas" })).toBeVisible();
    await expect(page.getByText("Ritual da Prosperidade")).toBeVisible();
    await expect(page.getByText("17 vagas")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver e reservar" })).toHaveAttribute("href", new RegExp(`/casa/${U(80)}\\?aba=rituais`));
    await page.getByRole("button", { name: "à distância" }).click(); // nenhum ritual à distância
    await expect(page.getByText("Nenhum ritual encontrado com esses filtros.")).toBeVisible();
    await noHScroll(page);
  });
}
