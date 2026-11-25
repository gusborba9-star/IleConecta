// Modelo do advogado (25/11/2026): versão nova de termo importante NÃO tranca ninguém. Aviso na Home, aceite só na próxima compra, venda ou assinatura.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";
import { LEGAL_VERSION, DOC_MIN_VERSION, LEGAL_VERSION_HISTORY } from "../../src/lib/legalCore.js";

const ME = U(1);
const perfil = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Casa Axé" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = { id: U(9), owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };
const anterior = LEGAL_VERSION_HISTORY[LEGAL_VERSION_HISTORY.indexOf(DOC_MIN_VERSION.termos_casa) - 1];
const aceite = (doc, v) => [{ doc_key: doc, doc_version: v, accepted_at: "2026-11-01T10:00:00Z" }];
const AVISO = "Atualizamos nossos Termos de Uso e Política de Privacidade.";

test("casa com aceite da versão anterior entra normalmente e vê o aviso na Home; 'Fechar / Ver depois' some com o aviso, sem tela de bloqueio", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await api(page, { rest: { profiles: perfil("casa"), legal_consents: aceite("termos_casa", anterior), houses: [house] }, rpc: {} });
  await page.goto("/");
  await expect(page.getByText(AVISO)).toBeVisible();
  await expect(page.getByText("será necessário aceitar a versão vigente")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Atualizamos os nossos termos" })).toHaveCount(0);
  await page.getByRole("button", { name: "Fechar / Ver depois" }).click();
  await expect(page.getByText(AVISO)).toHaveCount(0);
});

test("'Ler e aceitar agora' grava o aceite na versão vigente e encerra o aviso", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: perfil("casa"), legal_consents: aceite("termos_casa", anterior), houses: [house] }, rpc: { record_consent: "00000000-0000-0000-0000-0000000000aa" } });
  await page.goto("/");
  await page.getByRole("button", { name: "Ler e aceitar agora" }).click();
  const botao = page.getByRole("button", { name: "Aceitar e continuar" });
  await expect(botao).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await botao.click();
  await expect(page.getByText(AVISO)).toHaveCount(0);
  const gravou = calls.filter((c) => c.kind === "rpc" && c.name === "record_consent");
  expect(gravou.length).toBe(1);
  expect(gravou[0].body.p_doc).toBe("termos_casa");
  expect(gravou[0].body.p_version).toBe(LEGAL_VERSION);
});

test("cliente com aceite antigo também só vê o aviso; quem nunca aceitou vê a tela de aceite; quem aceitou a vigente não vê nada", async ({ page }) => {
  await api(page, { rest: { profiles: perfil("pessoa"), legal_consents: aceite("termos_cliente", "2026-10-rascunho-1") }, rpc: {} });
  await page.goto("/");
  await expect(page.getByText(AVISO)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toHaveCount(0);
});

test("quem nunca aceitou vê a tela de aceite", async ({ page }) => {
  await api(page, { rest: { profiles: perfil("pessoa"), legal_consents: [] }, rpc: {} });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
});

test("quem já aceitou a versão vigente entra direto, sem tela e sem aviso", async ({ page }) => {
  await api(page, { rest: { profiles: perfil("casa"), legal_consents: aceite("termos_casa", LEGAL_VERSION), houses: [house] }, rpc: {} });
  await page.goto("/");
  await expect(page.getByText(AVISO)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toHaveCount(0);
});
