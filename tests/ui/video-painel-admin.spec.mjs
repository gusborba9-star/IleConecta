// Card "Reuniões por vídeo" do painel (23/11/2026): estado, serviço, casas de teste e aviso do Daily. API simulada.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const ME = U(1);
const profile = { id: ME, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }));
const adminRpc = { is_admin: true, admin_my_access: { admin: true, owner: true, perms: [] }, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_set_setting: null };
const video = { key: "video", value: { state: "off", provider: "daily", beta_houses: [] } };

test("dono liga em modo de teste com a própria conta (Daily e LiveKit são oferecidos); grava a configuração completa", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [video] }, rpc: adminRpc });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Configurações" }).or(page.getByRole("button", { name: "Configurações" })).first().click();
  await expect(page.getByTestId("video-admin")).toBeVisible();
  const card = page.getByTestId("video-admin");
  await card.getByLabel("Estado", { exact: true }).selectOption("beta");
  await expect(card.getByLabel("Serviço das novas reuniões").locator("option")).toHaveText(["Daily", "LiveKit (tela própria)"]);
  await page.getByRole("button", { name: "Incluir a minha conta" }).click();
  await page.getByTestId("video-admin").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Vídeo atualizado.")).toBeVisible();
  const c = calls.filter((x) => x.name === "admin_set_setting" && x.body?.p_key === "video").pop();
  expect(c.body.p_value).toEqual({ state: "beta", provider: "daily", beta_houses: [ME] });
});

test("código de casa inválido na lista não grava nada", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [video] }, rpc: adminRpc });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Configurações" }).or(page.getByRole("button", { name: "Configurações" })).first().click();
  await page.getByLabel(/Casas de teste/).fill("isto-nao-e-um-codigo");
  await page.getByTestId("video-admin").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Há um código de casa inválido na lista.")).toBeVisible();
  expect(calls.some((x) => x.name === "admin_set_setting" && x.body?.p_key === "video")).toBe(false);
});

test("cadastrar aviso do Daily chama a função e confirma; recusa do Daily mostra erro", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [video] }, rpc: adminRpc, fn: { video: { ok: true, uuid: "w1" } } });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Configurações" }).or(page.getByRole("button", { name: "Configurações" })).first().click();
  await page.getByRole("button", { name: "Cadastrar aviso do Daily" }).click();
  await expect(page.getByText("Aviso do Daily cadastrado.")).toBeVisible();
  expect(calls.find((x) => x.kind === "fn" && x.name === "video").body).toEqual({ action: "setup_daily_webhook" });
});
