// O aceite dos Termos reaparece quando o texto muda de forma material (decisão do proprietário, 24/11/2026).
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";
import { LEGAL_VERSION, DOC_MIN_VERSION, LEGAL_VERSION_HISTORY } from "../../src/lib/legalCore.js";

const ME = U(1);
const perfil = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Casa Axé" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = { id: U(9), owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };
const anterior = LEGAL_VERSION_HISTORY[LEGAL_VERSION_HISTORY.indexOf(DOC_MIN_VERSION.termos_casa) - 1];
const aceite = (doc, v) => [{ doc_key: doc, doc_version: v, accepted_at: "2026-11-01T10:00:00Z" }];

test("casa que aceitou a versão anterior vê 'Atualizamos os nossos termos' e só segue depois de aceitar", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  const calls = await api(page, { rest: { profiles: perfil("casa"), legal_consents: aceite("termos_casa", anterior), houses: [house] }, rpc: { record_consent: "00000000-0000-0000-0000-0000000000aa" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atualizamos os nossos termos" })).toBeVisible();
  const botao = page.getByRole("button", { name: "Aceitar e continuar" });
  await expect(botao).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await botao.click();
  await expect(page.getByRole("heading", { name: "Atualizamos os nossos termos" })).toHaveCount(0);
  const gravou = calls.filter((c) => c.kind === "rpc" && c.name === "record_consent");
  expect(gravou.length).toBe(1);
  expect(gravou[0].body.p_doc).toBe("termos_casa");
  expect(gravou[0].body.p_version).toBe(LEGAL_VERSION);
});

test("cliente que aceitou a versão anterior também vê a tela; quem aceitou a versão vigente não vê", async ({ page }) => {
  await api(page, { rest: { profiles: perfil("pessoa"), legal_consents: aceite("termos_cliente", "2026-10-rascunho-1") }, rpc: {} });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atualizamos os nossos termos" })).toBeVisible();
});

test("quem já aceitou a versão vigente entra direto, sem a tela", async ({ page }) => {
  await api(page, { rest: { profiles: perfil("casa"), legal_consents: aceite("termos_casa", LEGAL_VERSION), houses: [house] }, rpc: {} });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atualizamos os nossos termos" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toHaveCount(0);
});
