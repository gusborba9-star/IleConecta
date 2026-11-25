// Minha conta do cliente (21/11/2026): Perfil, Atividade e Mensalidades (só para membro) numa tela só.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";

const ME = U(1);
const cliente = { id: ME, account_type: "pessoa", display_name: "Gezebel Souza", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_cliente", doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }];
const membro = [{ member_id: U(40), house_name: "Casa de Oxóssi", house_slug: "oxossi", owner_id: U(41), monthly_cents: 5000, due_day: 10, can_pay_app: true, dues: [] }];
const montar = (page, perfil = cliente, memberships = []) => api(page, { rest: { profiles: perfil, legal_consents: consents }, rpc: { my_memberships: memberships, report_client_error: true } });
const aba = (page, nome) => page.getByRole("tab", { name: nome, exact: true });

test("não-membro: só Perfil e Atividade; sem Reservas demonstrativas nem Recomendado; Mensalidades volta ao Perfil", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page);
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Gezebel Souza" })).toBeVisible();
  await expect(aba(page, "Perfil")).toHaveAttribute("aria-selected", "true");
  await expect(aba(page, "Atividade")).toBeVisible();
  await expect(aba(page, "Mensalidades")).toHaveCount(0);
  for (const t of ["Reservas demonstrativas", "Recomendado para você"]) await expect(page.getByRole("heading", { name: t })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Aparência" })).toBeVisible();
  await page.goto("/mensalidades"); // quem não é membro cai no Perfil
  await expect(page).toHaveURL(/\/perfil/);
  await expect(aba(page, "Perfil")).toHaveAttribute("aria-selected", "true");
  await noHScroll(page);
});

test("/atividade abre a aba Atividade; a aba mostra o estado vazio com caminhos", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page);
  await page.goto("/atividade");
  await expect(page).toHaveURL(/\/perfil\?aba=atividade/);
  await expect(aba(page, "Atividade")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Nada por aqui ainda" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Conhecer as casas" })).toBeVisible();
  await aba(page, "Perfil").click();
  await expect(aba(page, "Perfil")).toHaveAttribute("aria-selected", "true");
});

test("membro: aparece Mensalidades e /mensalidades abre nela, com a casa", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page, cliente, membro);
  await page.goto("/mensalidades");
  await expect(page).toHaveURL(/\/perfil\?aba=mensalidades/);
  await expect(aba(page, "Mensalidades")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Casa de Oxóssi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Minhas mensalidades" })).toHaveCount(0); // sem o cabeçalho duplicado
  await noHScroll(page);
});

for (const w of [320, 390]) {
  test(`celular ${w}px: capa, anel da foto concêntrico, abas e sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await montar(page, { ...cliente, bio: "Busco acolhimento e estudo.", display_name: "Gustavo dos Santos Albuquerque Borba Filho" });
    await page.goto("/perfil");
    await expect(page.getByText("Busco acolhimento e estudo.")).toBeVisible();
    const anel = page.locator("div.ring-gold\\/60").first();
    const caixa = await anel.boundingBox();
    const img = await anel.locator("> *").first().boundingBox();
    // a foto fica no centro do anel: folgas iguais dos quatro lados
    const folgas = [img.x - caixa.x, caixa.x + caixa.width - (img.x + img.width), img.y - caixa.y, caixa.y + caixa.height - (img.y + img.height)];
    for (const f of folgas) expect(Math.abs(f - folgas[0])).toBeLessThan(1.5);
    await expect(page.getByRole("button", { name: /Editar perfil/ })).toBeVisible();
    await noHScroll(page);
  });
}
