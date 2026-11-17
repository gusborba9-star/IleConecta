import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const ADMIN = U(1);
const profile = { id: ADMIN, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const item = (kind, ref, tab, title) => ({ kind, ref_id: ref, house_id: null, house_name: null, title, detail: "", priority: "alta", due_at: null, overdue: false, since: null, tab });
const CASES = { s1: U(201), s2: U(202), r1: U(211), r2: U(212), m1: U(221), m2: U(222) };
const PEND = {
  total: 4, overdue: 0, counts: { suporte: 1, denuncia_chat: 1, moderacao: 1, exclusao_conta: 1 },
  items: [item("suporte", CASES.s2, "suporte", "Chamado do alvo"), item("denuncia_chat", CASES.r2, "denuncias", "Denúncia do alvo"), item("moderacao", CASES.m2, "moderacao", "Moderação do alvo"), item("exclusao_conta", U(231), "suporte", "Exclusão")],
};
const queue = ["s1", "s2"].map((k, n) => ({ id: CASES[k], kind: "denuncia", priority: "alta", status: "aberto", title: `Chamado ${n + 1}`, opener_name: "Ana", subject_name: null, house_name: null, first_response_due: "2026-11-20T10:00:00Z", first_response_at: null, overdue: false, created_at: "2026-11-15T10:00:00Z" }));
const reports = ["r1", "r2"].map((k, n) => ({ id: CASES[k], reporter_name: `Denunciante ${n + 1}`, reported_name: "Fulano", reason: "outro", details: null, snapshot: [], evidence: [], status: "aberta", admin_note: null, created_at: "2026-11-15T10:00:00Z" }));
const mods = ["m1", "m2"].map((k, n) => ({ id: CASES[k], house_id: U(300 + n), house_name: `Casa ${n + 1}`, target_table: "posts", target_id: U(400 + n), reason: "promessa", excerpt: "x", status: "pendente", outcome: null, created_at: "2026-11-15T10:00:00Z", orientation_at: null, warned_at: null, deadline_at: null, hidden_at: null, contested_at: null, contest_text: null, contest_decision: null, admin_note: null, adaptation_start: null, adaptation_days: 30 }));

const setup = (page) => api(page, {
  rest: { profiles: profile, legal_consents: [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-5", accepted_at: "2026-11-01T10:00:00Z" }] },
  rpc: { is_admin: true, admin_pending_center: PEND, admin_support_queue: queue, admin_chat_reports: reports, admin_moderation_list: mods },
});
const resolve = (page, title) => page.locator("li").filter({ hasText: title }).getByRole("button", { name: /^Resolver em/ }).click();

test.describe("central da administração abre o item exato", () => {
  test("denúncia de conversa: seção certa, linha certa em foco (e só ela)", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await resolve(page, "Denúncia do alvo");
    await expect(page).toHaveURL(new RegExp(`s=config&foco=${CASES.r2}`));
    await expect(page.locator(`[data-foco="${CASES.r2}"]`)).toHaveAttribute("data-focused", "true");
    await expect(page.locator(`[data-foco="${CASES.r1}"]`)).not.toHaveAttribute("data-focused", "true");
    await expect(page.locator(`[data-foco="${CASES.r2}"]`)).toContainText("Denunciante 2");
  });
  test("moderação: a linha do alvo recebe o foco", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await resolve(page, "Moderação do alvo");
    await expect(page.locator(`[data-foco="${CASES.m2}"]`)).toHaveAttribute("data-focused", "true");
    await expect(page.locator(`[data-foco="${CASES.m1}"]`)).not.toHaveAttribute("data-focused", "true");
  });
  test("suporte: abre direto o chamado pedido (dossiê)", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/admin");
    await resolve(page, "Chamado do alvo");
    await expect(page).toHaveURL(new RegExp(`s=suporte&foco=${CASES.s2}`));
    await expect(page.getByRole("button", { name: /Chamado 1/ })).toHaveCount(0); // a fila deu lugar ao dossiê do chamado pedido
    expect(calls.some((c) => c.name === "admin_support_dossier")).toBe(true);
  });
  test("tipo sem linha própria abre só a seção; foco inválido na URL é ignorado (sem erro)", async ({ page }) => {
    await setup(page);
    await page.goto("/admin");
    await resolve(page, "Exclusão");
    await expect(page).toHaveURL(/s=suporte$/);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/admin?s=config&foco=${encodeURIComponent('"]),alert(1)//')}`);
    await page.waitForTimeout(1200);
    expect(errors).toEqual([]);
    expect(await page.locator("[data-focused]").count()).toBe(0);
  });
});
