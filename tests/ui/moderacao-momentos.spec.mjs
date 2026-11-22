// Moderação de Momentos: motivo "criança ou adolescente sem autorização" tem prioridade; decisões avisam a casa. API simulada.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const pessoa = { id: U(1), account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-11", accepted_at: "2026-11-01T10:00:00Z" }));
const row = (n, extra = {}) => ({ story_id: U(500 + n), house_id: U(10 + n), house_name: `Casa ${n}`, caption: null, media_kind: "image", media_path: null, poster_path: null, first_report: `2026-11-20T1${n}:00:00Z`, n_reports: 1, reasons: ["golpe"], hidden: false, ...extra });
const rpc = (reports, extra = {}) => ({ is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_moment_reports: reports, admin_moment_decide: "ok", ...extra });
const cardOf = (page, n) => page.locator("div.rounded-lg").filter({ hasText: new RegExp(`Casa ${n} · foto`) });
const base = { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] } };

test("denúncia de menor sobe para o topo, com aviso de prioridade e já oculta", async ({ page }) => {
  await api(page, { ...base, rpc: rpc([row(1), row(2, { reasons: ["menor", "golpe"], n_reports: 2, hidden: true }), row(3, { reasons: ["assedio"] })]) });
  await page.goto("/admin?s=config");
  await expect(page.getByRole("heading", { name: /Denúncias de momentos/ })).toBeVisible();
  const cards = page.locator("div.rounded-lg").filter({ hasText: /Casa \d · foto/ });
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Casa 2");
  await expect(cards.first().getByTestId("menor-priority")).toContainText("Prioridade: possível criança ou adolescente sem autorização. O Momento já está oculto");
  await expect(cards.first()).toContainText("Criança ou adolescente sem autorização, Golpe ou fraude");
  await expect(page.getByTestId("menor-priority")).toHaveCount(1);
});

test("remover envia a decisão, mostra que a casa foi avisada e recarrega a fila", async ({ page }) => {
  const calls = await api(page, { ...base, rpc: rpc([row(2, { reasons: ["menor"], hidden: true })]) });
  await page.goto("/admin?s=config");
  await cardOf(page, 2).getByLabel("Observação").fill("menor sem autorização");
  await cardOf(page, 2).getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("Momento removido. A casa foi avisada.")).toBeVisible();
  expect(calls.find((c) => c.name === "admin_moment_decide").body).toEqual({ p_story: U(502), p_action: "remover", p_note: "menor sem autorização" });
  expect(calls.filter((c) => c.name === "admin_moment_reports").length).toBeGreaterThanOrEqual(2);
});

test("manter no ar envia a decisão; erro do banco mostra mensagem e não some da fila", async ({ page }) => {
  const calls = await api(page, { ...base, rpc: rpc([row(1)]) });
  await page.goto("/admin?s=config");
  await cardOf(page, 1).getByRole("button", { name: "Manter no ar" }).click();
  await expect(page.getByText("Momento mantido no ar.")).toBeVisible();
  expect(calls.find((c) => c.name === "admin_moment_decide").body).toMatchObject({ p_action: "manter" });
  const p2 = await page.context().newPage();
  await api(p2, { ...base, rpc: rpc([row(1)], { admin_moment_decide: { status: 400, body: { message: "boom" } } }) });
  await p2.goto("/admin?s=config");
  await cardOf(p2, 1).getByRole("button", { name: "Remover" }).click();
  await expect(p2.getByText("Não foi possível concluir.")).toBeVisible();
  await expect(p2.getByText("Casa 1")).toBeVisible();
});

test("legenda hostil aparece como texto; quem não é da moderação não vê a fila", async ({ page }) => {
  await api(page, { ...base, rpc: rpc([row(1, { caption: "<img src=x onerror=window.__xss=1>" })]) });
  await page.goto("/admin?s=config");
  await expect(page.getByText("“<img src=x onerror=window.__xss=1>”")).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  const p2 = await page.context().newPage();
  await api(p2, { ...base, rpc: rpc([row(1)], { admin_my_access: { admin: true, owner: false, perms: ["suporte"] } }) });
  await p2.goto("/admin?s=config");
  await p2.waitForTimeout(600);
  await expect(p2.getByRole("heading", { name: /Denúncias de momentos/ })).toHaveCount(0);
});
