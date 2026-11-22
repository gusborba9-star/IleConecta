// Início do cliente (21/11/2026): "Para você" (o que está acontecendo) + atalhos, acima da comunidade, como no Facebook.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Ana", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }));
const ontem = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
const pedido = (id, status, title) => ({ id: U(id), service_id: null, title, price_cents: 9000, note: null, status, client_id: ME, created_at: "2026-11-10T10:00:00Z", stages_total: 1, modality: null, scheduled_at: null, houses: { name: "Casa de Oxóssi", owner_id: U(41) } });
const venc = [{ member_id: U(40), house_name: "Casa de Iansã", house_slug: "iansa", owner_id: U(42), monthly_cents: 5000, due_day: 10, can_pay_app: true, dues: [{ id: U(50), month: "2026-11-01", amount_cents: 5000, due_date: ontem, status: "aberta", paid_via: null }] }];

const montar = (page, { orders = [], memberships = [] } = {}) => api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [], service_orders: orders, reservations: [] }, rpc: { my_memberships: memberships, report_client_error: true } });

test("sem nada acontecendo: sem bloco Para você, sem o cartão antigo, e a ordem é busca → momentos → feed", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Para você" })).toHaveCount(0);
  await expect(page.getByText("O que as casas estão compartilhando")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Atalhos", exact: true })).toHaveCount(0); // os caminhos ficam na barra de cima, sem repetir
  const compor = page.getByRole("link", { name: /Buscar casas e rituais/ });
  await expect(compor).toHaveAttribute("href", "/descobrir");
  await expect(page.getByRole("link", { name: /^Minha conta, Ana/ })).toHaveAttribute("href", "/perfil");
  await expect(compor).toBeVisible();
  // sem Momentos para ver, a faixa inteira some: nada de cartão "Sua conta", título solto nem texto explicando o óbvio
  await expect(page.getByRole("region", { name: "Momentos das casas" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Momentos das casas" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sua conta" })).toHaveCount(0);
  await expect(page.getByText(/Quando as casas que você acompanha/)).toHaveCount(0);
  await noHScroll(page);
});

test("com pendências: críticas primeiro, número em vermelho, links certos, minimizar mantém as críticas", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page, { orders: [pedido(60, "aguardando_pagamento", "Jogo de búzios"), pedido(61, "em_andamento", "Limpeza espiritual")], memberships: venc });
  await page.goto("/");
  const card = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Para você" }) }).last();
  await expect(page.getByRole("heading", { name: "Para você" })).toBeVisible();
  const itens = page.getByRole("link").filter({ hasText: /Mensalidade vencida|Pagar pedido|Pedido em andamento/ });
  await expect(itens).toHaveCount(3);
  await expect(itens.nth(0)).toContainText("Mensalidade vencida");
  await expect(itens.nth(0)).toHaveAttribute("href", "/perfil?aba=mensalidades");
  await expect(itens.nth(1)).toContainText("Pagar pedido");
  await expect(itens.nth(2)).toContainText("Pedido em andamento");
  await expect(card).toContainText("3");
  // minimizar: vira faixa; só as críticas continuam à mostra
  await page.getByRole("button", { name: /Minimizar/ }).click();
  const faixa = page.getByRole("button", { name: /^Para você\s*, 3 avisos/ });
  await expect(faixa).toBeVisible();
  await expect(page.getByRole("link", { name: /Mensalidade vencida/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pagar pedido/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pedido em andamento/ })).toHaveCount(0);
  await noHScroll(page);
  await page.reload(); // a escolha de minimizar é lembrada
  await expect(page.getByRole("button", { name: /^Para você\s*, 3 avisos/ })).toBeVisible();
  await page.getByRole("button", { name: /^Para você\s*, 3 avisos/ }).click();
  await expect(page.getByRole("heading", { name: "Para você" })).toBeVisible();
  await page.getByRole("link", { name: /Pagar pedido/ }).click();
  await expect(page).toHaveURL(/\/perfil\?aba=atividade/);
});

test("mais de 3 avisos: 'Ver todos' abre o restante; 320 px sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await montar(page, { orders: [pedido(60, "aguardando_pagamento", "A"), pedido(61, "em_andamento", "B"), pedido(62, "confirmado", "C")], memberships: venc });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Ver todos (4)" })).toBeVisible();
  await page.getByRole("button", { name: "Ver todos (4)" }).click();
  await expect(page.getByRole("link", { name: /Pedido confirmado/ })).toBeVisible();
  await page.getByRole("button", { name: "Ver menos" }).click();
  await expect(page.getByRole("link", { name: /Pedido confirmado/ })).toHaveCount(0);
  await noHScroll(page);
});

test("a Comunidade (/comunidade) continua só com o feed, sem o bloco Para você", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page, { orders: [pedido(60, "aguardando_pagamento", "A")] });
  await page.goto("/comunidade");
  await expect(page.getByRole("heading", { name: "Comunidade" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para você" })).toHaveCount(0);
});
