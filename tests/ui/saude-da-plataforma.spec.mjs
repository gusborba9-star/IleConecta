// Saúde da plataforma: o app relata erros inesperados (sem identificar a pessoa) e o cartão do dono mostra o estado. API simulada; nada sai para a internet.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ADMIN = U(1);
const profile = { id: ADMIN, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "dados_sensiveis", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }];
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const HEALTH = {
  generated_at: ago(5000), last_hour: { erro_app: 3, ia_falha: 0, funcao_erro: 1 }, last_24h: { erro_app: 9, ia_falha: 2, funcao_erro: 1 },
  top: [
    { kind: "erro_app", source: "app", route: "/casa/:id", detail: "TypeError: x is undefined", n: 5, first_at: ago(7200000), last_at: ago(120000) },
    { kind: "erro_app", source: "app", route: null, detail: "<img src=x onerror=window.__xss=1>", n: 2, first_at: ago(3600000), last_at: ago(60000) },
  ],
  cron: [
    { name: "refund-sweep", schedule: "*/10 * * * *", active: true, last_run: ago(300000), last_status: "succeeded", runs_24h: 144, failed_24h: 0, failed_30min: 0, can_run: true },
    { name: "plan-trial-revert", schedule: "5 * * * *", active: true, last_run: ago(600000), last_status: "failed", runs_24h: 24, failed_24h: 1, failed_30min: 1, can_run: true },
    { name: "purge-live-pings", schedule: "30 3 * * *", active: true, last_run: null, last_status: null, runs_24h: 0, failed_24h: 0, failed_30min: 0, can_run: false },
  ],
  db: { size_bytes: 27 * 1048576, connections: 7 }, alerts: [{ code: "cron_falhou:plan-trial-revert", since: ago(500000), seen_at: null }, { code: "pico:ia_falha", since: ago(900000), seen_at: ago(60000) }],
  manual_runs: [{ routine: "refund-sweep", at: ago(3600000), ok: true, note: null }],
};

test.describe("app relata erros inesperados", () => {
  test("erro de execução e promessa rejeitada viram relato; ruído não; a consulta da página nunca sai", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { report_client_error: true } });
    await page.goto("/termos?token=segredo-do-convite");
    await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
    await page.evaluate(() => {
      setTimeout(() => { throw new TypeError("falha de teste ao abrir a tela"); }, 0);
      setTimeout(() => { Promise.reject(new Error("promessa de teste rejeitada")); }, 0);
      setTimeout(() => { window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." })); }, 0);
      setTimeout(() => { Promise.reject(new TypeError("Failed to fetch")); }, 0);
    });
    await expect.poll(() => calls.filter((c) => c.name === "report_client_error").length).toBe(2);
    const r = calls.filter((c) => c.name === "report_client_error").map((c) => c.body);
    expect(r.some((b) => /TypeError: falha de teste ao abrir a tela/.test(b.p_message))).toBe(true);
    expect(r.some((b) => /promessa de teste rejeitada/.test(b.p_message))).toBe(true);
    expect(r.every((b) => b.p_route === "/termos" && b.p_source === "app")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("segredo-do-convite");
    expect(JSON.stringify(r)).not.toContain("127.0.0.1:4174");
  });

  test("o mesmo erro repetido 50 vezes vira um relato só", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { report_client_error: true } });
    await page.goto("/termos");
    await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
    await page.evaluate(() => { const f = () => { throw new Error("erro repetido"); }; for (let i = 0; i < 50; i++) setTimeout(() => { try { f(); } catch (e) { window.dispatchEvent(new ErrorEvent("error", { error: e, message: e.message })); } }, i); });
    await expect.poll(() => calls.filter((c) => c.name === "report_client_error").length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(600);
    expect(calls.filter((c) => c.name === "report_client_error").length).toBe(1);
  });

  test("se o servidor recusar o relato (limite, fora do ar), o app segue normal e sem aviso na tela", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { report_client_error: { status: 500, body: { message: "boom" } } } });
    await page.goto("/termos");
    await page.evaluate(() => setTimeout(() => { throw new Error("erro com servidor fora"); }, 0));
    await expect.poll(() => calls.filter((c) => c.name === "report_client_error").length).toBe(1);
    await expect(page.getByRole("heading", { name: "Termos e normas" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("tela que não abre (arquivo não chega) mostra o aviso E relata", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { report_client_error: true } });
    await page.route(/\/src\/pages\/Terms\.tsx/, (route) => route.abort());
    await page.goto("/termos");
    await expect(page.getByRole("alert")).toContainText("Não foi possível abrir esta tela");
    await expect.poll(() => calls.filter((c) => c.name === "report_client_error").length).toBeGreaterThanOrEqual(1);
    expect(calls.find((c) => c.name === "report_client_error").body.p_message).toMatch(/dynamically imported module|Failed to fetch/i);
  });
});

test.describe("cartão Saúde da plataforma (dono)", () => {
  for (const vp of [{ name: "celular 375", width: 375, height: 740 }, { name: "desktop", width: 1280, height: 800 }]) {
    test(`mostra estado, contagens, erros frequentes e rotinas (${vp.name}); texto hostil fica como texto`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: HEALTH } });
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "Saúde da plataforma" })).toBeVisible();
      await expect(page.getByText("Precisa de atenção")).toBeVisible();
      await expect(page.getByText("2 alertas em aberto")).toBeVisible();
      await expect(page.getByText("Erros no app", { exact: true })).toBeVisible();
      await expect(page.getByText("5×")).toBeVisible();
      await expect(page.getByText("TypeError: x is undefined")).toBeVisible();
      await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      const cron = page.getByRole("region", { name: "Rotinas agendadas" });
      await expect(cron.locator("li")).toHaveCount(3);
      await expect(cron.locator("li").nth(1)).toContainText("falhando agora");
      await expect(cron.locator("li").nth(2)).toContainText("nunca rodou");
      await expect(cron.locator("li").nth(0)).toContainText("Confere e conclui os reembolsos pendentes com a Stripe.");
      await expect(cron.locator("li").nth(0)).toContainText("Roda a cada 10 minutos");
      await expect(cron.locator("li").nth(1)).toContainText("Devolve a casa ao plano anterior");
      await expect(cron.locator("li").nth(2)).toContainText("Roda todo dia às 00:30 (Brasília)");
      await expect(page.getByText(/Banco: 27 MB · 7 conexões/)).toBeVisible();
      await noHScroll(page);
    });
  }
  test("tudo certo: sem erros, rotinas ok", async ({ page }) => {
    await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: { ...HEALTH, last_hour: {}, last_24h: {}, top: [], alerts: [], cron: [HEALTH.cron[0]] } } });
    await page.goto("/admin");
    await expect(page.getByText("Tudo certo")).toBeVisible();
    await expect(page.getByText("Nenhum erro registrado nas últimas 24 horas.")).toBeVisible();
  });
  test("erro do servidor aparece como aviso sem detalhe técnico; atualizar tenta de novo", async ({ page }) => {
    let falha = true;
    await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: () => (falha ? { status: 500, body: { message: "Falhou aqui" } } : HEALTH) } });
    await page.goto("/admin");
    await expect(page.getByText("Falhou aqui")).toBeVisible();
    falha = false;
    await page.getByRole("button", { name: "Atualizar saúde da plataforma" }).click();
    await expect(page.getByText("Precisa de atenção")).toBeVisible();
  });
  test("administrador sem o módulo 'dono' não vê o cartão (nem chama o servidor)", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_my_access: { admin: true, owner: false, perms: ["suporte"] }, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: HEALTH } });
    await page.goto("/admin?s=suporte");
    await page.waitForTimeout(500);
    await page.goto("/admin");
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "Saúde da plataforma" })).toHaveCount(0);
    expect(calls.filter((c) => c.name === "admin_health").length).toBe(0);
  });
});

test.describe("ações do dono no cartão", () => {
  const setup = (page, extra = {}) => api(page, { rest: { profiles: profile, legal_consents: consents }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: HEALTH, ...extra } });
  test("alerta abre com 'o que fazer' em português; 'Já vi' chama o servidor", async ({ page }) => {
    let visto = false;
    const calls = await setup(page, {
      admin_ack_alert: () => { visto = true; return true; },
      admin_health: () => (visto ? { ...HEALTH, alerts: HEALTH.alerts.map((a) => ({ ...a, seen_at: a.seen_at ?? ago(1000) })) } : HEALTH),
    });
    await page.goto("/admin");
    const al = page.getByRole("region", { name: "Alertas em aberto" });
    await expect(al.locator("ul > li")).toHaveCount(2);
    await expect(al.locator("ul > li").nth(0)).toContainText("novo");
    await expect(al.locator("ul > li").nth(1)).toContainText("visto");
    await al.getByText('A rotina "plan-trial-revert" falhou').click();
    await expect(al).toContainText("Toque em “Rodar agora” nessa rotina");
    await expect(al).toContainText("Você confere e, se continuar, me chama");
    await al.getByRole("button", { name: "Já vi" }).click();
    await expect.poll(() => calls.filter((c) => c.name === "admin_ack_alert").length).toBe(1);
    expect(calls.find((c) => c.name === "admin_ack_alert").body).toEqual({ p_code: "cron_falhou:plan-trial-revert" });
    await expect(al.getByRole("button", { name: "Já vi" })).toHaveCount(0);
  });
  test("erro frequente abre com quem resolve e o que fazer", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    const top = page.getByRole("region", { name: "Erros mais frequentes" });
    await top.getByText("TypeError: x is undefined").click();
    await expect(top).toContainText("Quem resolve: eu (Claude)");
    await expect(top).toContainText("Me mande um print desta tela");
  });
  test("'Rodar agora': pede confirmação, roda só a rotina escolhida; rotina de limpeza não tem botão", async ({ page }) => {
    const calls = await setup(page, { admin_run_routine: { ok: true } });
    await page.goto("/admin");
    const cron = page.getByRole("region", { name: "Rotinas agendadas" });
    await expect(cron.getByRole("button", { name: /Rodar agora a rotina/ })).toHaveCount(2);
    await expect(cron.locator("li").nth(2).getByRole("button")).toHaveCount(0);
    await cron.getByRole("button", { name: "Rodar agora a rotina refund-sweep" }).click();
    expect(calls.filter((c) => c.name === "admin_run_routine").length).toBe(0);
    await cron.getByRole("button", { name: "Cancelar" }).click();
    expect(calls.filter((c) => c.name === "admin_run_routine").length).toBe(0);
    await cron.getByRole("button", { name: "Rodar agora a rotina refund-sweep" }).click();
    await cron.getByRole("button", { name: "Rodar", exact: true }).click();
    await expect.poll(() => calls.filter((c) => c.name === "admin_run_routine").length).toBe(1);
    expect(calls.find((c) => c.name === "admin_run_routine").body).toEqual({ p_name: "refund-sweep" });
    await expect(cron.getByRole("status")).toContainText("Rotina executada");
  });
  test("'Rodar agora' que falha de novo mostra o motivo e pede o print", async ({ page }) => {
    await setup(page, { admin_run_routine: { ok: false, message: "division by zero" } });
    await page.goto("/admin");
    const cron = page.getByRole("region", { name: "Rotinas agendadas" });
    await cron.getByRole("button", { name: "Rodar agora a rotina plan-trial-revert" }).click();
    await cron.getByRole("button", { name: "Rodar", exact: true }).click();
    await expect(cron.getByRole("status")).toContainText("Falhou de novo: division by zero");
    await expect(cron.getByRole("status")).toContainText("Me mande um print");
  });
  test("servidor recusa (um minuto, limite): a mensagem aparece e o app segue de pé", async ({ page }) => {
    await setup(page, { admin_run_routine: { status: 400, body: { message: "Esta rotina acabou de rodar. Espere um minuto." } } });
    await page.goto("/admin");
    const cron = page.getByRole("region", { name: "Rotinas agendadas" });
    await cron.getByRole("button", { name: "Rodar agora a rotina refund-sweep" }).click();
    await cron.getByRole("button", { name: "Rodar", exact: true }).click();
    await expect(cron.getByRole("status")).toContainText("acabou de rodar");
    await expect(page.getByRole("heading", { name: "Saúde da plataforma" })).toBeVisible();
  });
  test("últimas execuções manuais aparecem; texto hostil no alerta fica como texto", async ({ page }) => {
    await setup(page, { admin_health: { ...HEALTH, alerts: [{ code: "<img src=x onerror=window.__xss=2>", since: ago(1000), seen_at: null }], manual_runs: [{ routine: "refund-sweep", at: ago(3600000), ok: false, note: "<b>x</b>" }] } });
    await page.goto("/admin");
    await expect(page.getByRole("region", { name: "Últimas execuções manuais" })).toContainText("falhou: <b>x</b>");
    await expect(page.getByRole("region", { name: "Alertas em aberto" })).toContainText("Alerta técnico");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
  test("celular 375: sem rolagem lateral com alertas e botões", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await setup(page);
    await page.goto("/admin");
    await page.getByRole("region", { name: "Alertas em aberto" }).getByText('A rotina "plan-trial-revert" falhou').click();
    await page.getByRole("region", { name: "Rotinas agendadas" }).getByRole("button", { name: "Rodar agora a rotina refund-sweep" }).click();
    await noHScroll(page);
  });
});
