import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ADMIN = U(1), ANA = U(2);
const profile = { id: ADMIN, account_type: "pessoa", display_name: "Gustavo", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const row = (id, key, who, name) => ({ id, key, created_at: new Date(Date.UTC(2026, 10, 16, 12, 0, 60 - (id % 60))).toISOString(), admin_id: who, actor: name });
const PAGE1 = Array.from({ length: 50 }, (_, i) => row(100 - i, i % 2 ? "pricing" : "house_plan", i % 3 ? ADMIN : ANA, i % 3 ? "Gustavo" : "Ana Suporte"));
PAGE1[0] = row(100, "pricing", ANA, "<img src=x onerror=window.__xss=1>");
const PAGE2 = [row(50, "features", ADMIN, "Gustavo"), row(49, "doc:termos", null, "Administrador removido")];

test("histórico mostra quem fez, filtra por pessoa e pagina sem repetir (app inteiro)", async ({ page }) => {
  const calls = await api(page, {
    rest: { profiles: profile, legal_consents: [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-9", accepted_at: "2026-11-01T10:00:00Z" }] },
    rpc: { is_admin: true, admin_houses_plans: [], admin_houses_seats: [], admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] },
      admin_audit_feed: (b) => (b.p_before ? PAGE2 : PAGE1) },
  });
  await page.goto("/admin?s=historico");
  const list = page.getByTestId("audit-list");
  await expect(list.locator("li")).toHaveCount(50);
  await expect(list.locator("li").first()).toContainText("<img src=x onerror=window.__xss=1>");
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(list.locator("li").nth(1)).toContainText("Gustavo");
  await noHScroll(page);
  await page.getByRole("button", { name: "Ver mais antigos" }).click();
  await expect(list.locator("li")).toHaveCount(52);
  await expect(list.locator("li").last()).toContainText("Administrador removido");
  expect(calls.filter((c) => c.name === "admin_audit_feed").map((c) => c.body.p_before).filter((v, i, a) => a.indexOf(v) === i)).toEqual([null, 51]); // o modo de desenvolvimento do React pode repetir a 1ª leitura
  await page.getByLabel("Filtrar por quem fez").selectOption(ANA);
  const n = await list.locator("li").count();
  expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(52);
  expect((await list.locator("li").allInnerTexts()).every((t) => t.includes("Ana Suporte") || t.includes("onerror"))).toBe(true);
  await expect(page.getByRole("button", { name: "Ver mais antigos" })).toHaveCount(0);
});

test("falha ao carregar mostra lista vazia, sem quebrar", async ({ page }) => {
  await api(page, {
    rest: { profiles: profile, legal_consents: [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-9", accepted_at: "2026-11-01T10:00:00Z" }] },
    rpc: { is_admin: true, admin_houses_plans: [], admin_houses_seats: [], admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_audit_feed: { status: 500, body: { message: "boom" } } },
  });
  await page.goto("/admin?s=historico");
  await expect(page.getByText("Nenhuma alteração ainda.")).toBeVisible();
});
