// Administração, aba Configurações: barra "Ir para…" leva direto ao grupo de cartões (no celular, sem rolar dezenas de cartões). API simulada.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";

const pessoa = { id: U(1), account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }));
const base = { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] } };
const rpc = (extra = {}) => ({ is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_moment_reports: [], ...extra });

test("o dono vê os 6 grupos e o toque leva ao grupo certo no celular", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await api(page, { ...base, rpc: rpc() });
  await page.goto("/admin?s=config");
  const nav = page.getByRole("navigation", { name: "Ir para um grupo de configurações" });
  await expect(nav).toBeVisible();
  for (const nome of ["Plataforma e planos", "Equipe e contas", "Moderação", "Comunicação", "Dinheiro e preços", "Assistente e alcance"]) await expect(nav.getByRole("button", { name: nome })).toBeVisible();
  await nav.getByRole("button", { name: "Dinheiro e preços" }).click();
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("g-dinheiro").getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThan(260);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("a barra não aparece fora da aba Configurações", async ({ page }) => {
  await api(page, { ...base, rpc: rpc() });
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Ir para um grupo de configurações" })).toHaveCount(0);
});

test("buscar 'música' mostra o cartão da biblioteca e o toque leva até ele, sem acento ou maiúscula", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await api(page, { ...base, rpc: rpc() });
  await page.goto("/admin?s=config");
  const busca = page.getByLabel("Ir para um cartão de configuração");
  await busca.fill("MUSICA");
  const opcoes = page.getByRole("listbox", { name: "Cartões encontrados" }).getByRole("option");
  await expect(opcoes.first()).toBeVisible();
  const nome = (await opcoes.first().innerText()).trim();
  await opcoes.first().getByRole("button").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: nome }).first()).toBeInViewport();
  await busca.fill("zzzz-nada");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
