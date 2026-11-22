import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const CLIENT = U(5), A = U(1), AH = U(60), B = U(2), BH = U(61), C = U(3), CH = U(62);
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const cliente = { id: CLIENT, account_type: "cliente", display_name: "Cliente Ana", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const casa = (id, owner, name, city, bio) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio, city, state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const HOUSES = [
  casa(AH, A, "Casa Salvador", "Salvador", "Trabalhos de amor e união"),
  casa(BH, B, "Casa Manaus", "Manaus", "Trabalhos de amor e proteção"),
  casa(CH, C, "Casa Salvador Dois", "Salvador", "Aulas e palestras"),
];
const setup = (page) => api(page, {
  rest: { profiles: cliente, legal_consents: consents, houses: HOUSES },
  rpc: { house_follow_summary: { counts: {}, mine: [] }, my_memberships: [] },
});

test("Descobrir: sem linhas de tradição; intenção filtra; texto livre reconhece a intenção", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/descobrir");
  await expect(page.getByRole("button", { name: "Candomblé Ketu" })).toHaveCount(0);
  await expect(page.getByText("Casa Salvador", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Amor", exact: true }).click();
  await expect(page.getByText("Casa Salvador", { exact: true })).toBeVisible();
  await expect(page.getByText("Casa Manaus")).toBeVisible();
  await expect(page.getByText("Casa Salvador Dois")).toHaveCount(0);
  await page.getByRole("button", { name: "Amor", exact: true }).click();
  await page.getByLabel("Buscar casas", { exact: true }).fill("proteção");
  await expect(page.getByText("Casa Manaus")).toBeVisible();
  await expect(page.getByText("Casa Salvador", { exact: true })).toHaveCount(0);
  await noHScroll(page);
});

test("Descobrir: Na minha cidade usa a cidade do perfil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/descobrir");
  await page.getByRole("button", { name: "Na minha cidade" }).click();
  await expect(page.getByText("Casa Salvador", { exact: true })).toBeVisible();
  await expect(page.getByText("Casa Salvador Dois")).toBeVisible();
  await expect(page.getByText("Casa Manaus")).toHaveCount(0);
});

test("Descobrir (desktop): um único campo de busca", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setup(page);
  await page.goto("/descobrir");
  await expect(page.getByLabel("Buscar casas", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Buscar casas e rituais")).toBeHidden();
  await page.goto("/rituais");
  await expect(page.getByLabel("Buscar casas e rituais")).toBeVisible();
});
