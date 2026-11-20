// Interruptor de emergência: faixa de aviso para os usuários e card do dono. API simulada; nada sai para a internet.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1);
const profile = { id: ME, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const off = { key: "maintenance", value: { assistant: false, payments: false, message: null, since: null } };
const on = (extra = {}) => ({ key: "maintenance", value: { assistant: false, payments: true, message: null, since: "2026-11-18T01:00:00Z", ...extra } });
const adminRpc = { is_admin: true, admin_my_access: { admin: true, owner: true, perms: [] }, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_set_maintenance: null };

test("em manutenção: faixa visível com o texto padrão; desligado: nada aparece", async ({ page }) => {
  await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [on()] }, rpc: {} });
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Os pagamentos estão em manutenção. Nada foi cobrado. Voltamos em breve." })).toBeVisible();
  await noHScroll(page);
  const p2 = await page.context().newPage();
  await api(p2, { rest: { profiles: profile, legal_consents: consents, platform_settings: [off] }, rpc: {} });
  await p2.goto("/");
  await p2.waitForTimeout(800);
  await expect(p2.getByText(/em manutenção/)).toHaveCount(0);
});

test("mensagem escrita pelo dono aparece no lugar do texto padrão, sem interpretar HTML", async ({ page }) => {
  await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [on({ message: "Voltamos às 22h <img src=x onerror=window.__xss=1>" })] }, rpc: {} });
  await page.goto("/");
  await expect(page.getByText("Voltamos às 22h <img src=x onerror=window.__xss=1>")).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("falha ao ler a configuração: nada é bloqueado nem aparece aviso (falha segura)", async ({ page }) => {
  await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: { status: 500, body: { message: "boom" } } }, rpc: {} });
  await page.goto("/");
  await page.waitForTimeout(800);
  await expect(page.getByText(/em manutenção/)).toHaveCount(0);
});

test("card do dono: pede confirmação ao ligar, grava só o que mudou e mostra o estado", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [off] }, rpc: adminRpc });
  await page.goto("/admin");
  const card = page.locator("section,div").filter({ has: page.getByRole("heading", { name: "Interruptor de emergência" }) }).last();
  await expect(page.getByRole("heading", { name: "Interruptor de emergência" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /^Pagamentos/ }).check();
  await page.getByLabel("Mensagem para os usuários (opcional)").fill("Voltamos às 22h");
  await page.getByRole("button", { name: "Ligar manutenção" }).click();
  await expect(page.getByRole("dialog")).toContainText("desliga os pagamentos");
  await page.getByRole("dialog").getByRole("button", { name: "Ligar manutenção" }).click();
  await expect(page.getByText("Manutenção ligada. Os usuários já veem o aviso.")).toBeVisible();
  const c = calls.find((x) => x.name === "admin_set_maintenance");
  expect(c.body).toEqual({ p_assistant: false, p_payments: true, p_message: "Voltamos às 22h" });
  void card;
});

test("card do dono: cancelar a confirmação não grava nada; quem não é dono nem vê o card", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [off] }, rpc: adminRpc });
  await page.goto("/admin");
  await page.getByRole("checkbox", { name: /^Assistente \(IA\)/ }).check();
  await page.getByRole("button", { name: "Ligar manutenção" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click();
  expect(calls.filter((x) => x.name === "admin_set_maintenance").length).toBe(0);
  const p2 = await page.context().newPage();
  await api(p2, { rest: { profiles: profile, legal_consents: consents, platform_settings: [off] }, rpc: { ...adminRpc, admin_my_access: { admin: true, owner: false, perms: ["suporte"] } } });
  await p2.goto("/admin");
  await p2.waitForTimeout(800);
  await expect(p2.getByRole("heading", { name: "Interruptor de emergência" })).toHaveCount(0);
});

test("acessibilidade (axe): faixa de aviso e card do dono, claro e escuro", async ({ page }) => {
  let AxeBuilder = null;
  try { AxeBuilder = (await import("@axe-core/playwright")).default; } catch { /* pacote ausente */ }
  test.skip(!AxeBuilder, "pacote @axe-core/playwright não instalado");
  test.setTimeout(90000);
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await api(page, { rest: { profiles: profile, legal_consents: consents, platform_settings: [on({ assistant: true })] }, rpc: adminRpc });
    for (const tela of ["/", "/admin"]) {
      await page.goto(tela);
      await page.waitForTimeout(700);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      expect(r.violations.map((v) => `${tela} ${scheme} ${v.id}: ${v.nodes[0].target.join(" ")}`)).toEqual([]);
    }
  }
});
