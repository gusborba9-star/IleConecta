import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1); // a conta da titular (SESSION.user.id)
const HOUSE_ROW_ID = "7188c6e9-a4ec-4ab0-8690-748e7501e2a4"; // id interno da casa (diferente do id da conta)
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Teste", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const houseRow = { id: HOUSE_ROW_ID, owner_id: OWNER, name: "Casa Teste", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };

test("experimento: a página da casa abre pelo id da conta e não pelo id interno", async ({ page }) => {
  await api(page, { rest: { profiles: profile, houses: [houseRow] } });
  await page.goto(`/casa/${OWNER}`);
  await expect(page.getByText("Casa Teste").first()).toBeVisible();
  const p2 = await page.context().newPage();
  await api(p2, { rest: { profiles: profile, houses: [houseRow] } });
  await p2.goto(`/casa/${HOUSE_ROW_ID}`);
  await expect(p2.getByText("Casa indisponível")).toBeVisible();
});

const item = (kind, n, tab, o = {}) => ({ kind, ref_id: U(100 + n), title: `Item ${kind}`, detail: "", priority: "normal", due_at: null, overdue: false, since: null, tab, ...o });
const KINDS = [
  ["pedido_para_iniciar", "pedidos"], ["reembolso_da_casa", "pedidos"], ["avaliacao_sem_resposta", "avaliacoes"],
  ["conta_de_recebimento", "cadastro"], ["fatura", "cobranca"], ["conversa_sem_resposta", "atendimento"],
];
const PEND = { house_id: HOUSE_ROW_ID, house_name: "Casa Teste", role: "titular", total: KINDS.length, overdue: 0, counts: Object.fromEntries(KINDS.map(([k]) => [k, 1])), items: KINDS.map(([k, t], i) => item(k, i, t)), to_pay: { charges: [{ id: U(105), kind: "vaga_adicional", description: "Vaga adicional", amount_cents: 3990, due_date: "2026-12-17", status: "pendente", pix_discount_cents: 400, overdue: false }] } };

test.describe("destinos das pendências da casa abrem a tela certa (app inteiro)", () => {
  const setup = async (page) => api(page, {
    rest: { profiles: profile, houses: [houseRow], legal_consents: [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-5", accepted_at: "2026-11-01T10:00:00Z" }] },
    rpc: { house_pending_center: PEND, payments_enabled: true, house_invoices: [], my_staff_house: [] },
  });
  const go = async (page, label) => {
    await page.goto("/");
    const li = page.locator("li").filter({ hasText: `Item ${label}` });
    await li.getByRole("button", { name: /^Abrir/ }).click();
  };

  test("pedido e reembolso levam à aba Serviços da PRÓPRIA casa (id da conta)", async ({ page }) => {
    await setup(page);
    for (const k of ["pedido_para_iniciar", "reembolso_da_casa"]) {
      await go(page, k);
      await expect(page).toHaveURL(new RegExp(`/casa/${OWNER}\\?aba=servicos`));
      await expect(page.getByText("Casa indisponível")).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Serviços" })).toHaveAttribute("aria-selected", "true");
    }
  });
  test("avaliação sem resposta abre a aba Avaliações da casa", async ({ page }) => {
    await setup(page);
    await go(page, "avaliacao_sem_resposta");
    await expect(page).toHaveURL(new RegExp(`/casa/${OWNER}\\?aba=avaliacoes`));
    await expect(page.getByText("Casa indisponível")).toHaveCount(0);
  });
  test("conta de recebimento leva ao início (onde está o cartão da conta)", async ({ page }) => {
    await setup(page);
    await go(page, "conta_de_recebimento");
    await expect(page).toHaveURL(/\/\?foco=recebimento$/);
    await expect(page.getByRole("heading", { name: "Recebimento pela plataforma" })).toBeVisible();
    await expect(page.locator("#recebimento")).toHaveAttribute("data-focused", "true");
  });
  test("fatura: abre /planos com a fatura em foco; 'a pagar' mostra o preço no Pix", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    const pay = page.getByRole("region", { name: "A pagar à plataforma" });
    await expect(pay).toContainText(/no Pix: R\$\s35,90/);
    await pay.getByRole("button", { name: /Abrir fatura/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/planos\\?foco=${U(105)}`));
  });
  test("conversa sem resposta abre as conversas", async ({ page }) => {
    await setup(page);
    await go(page, "conversa_sem_resposta");
    await expect(page).toHaveURL(/\/mensagens$/);
  });
});

test("equipe: pedido e conversa abrem a aba certa do Atendimento; nada leva a telas da titular", async ({ page }) => {
  const STAFF = { role: "equipe", house_id: HOUSE_ROW_ID, house_name: "Casa Teste", total: 2, overdue: 0, counts: { pedido_para_iniciar: 1, conversa_sem_resposta: 1, reembolso_da_casa: 1 }, items: [item("pedido_para_iniciar", 1, "pedidos"), item("conversa_sem_resposta", 2, "atendimento"), item("reembolso_da_casa", 3, "pedidos")], to_pay: null };
  await api(page, {
    rest: { profiles: { ...profile, account_type: "pessoa" }, legal_consents: [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-5", accepted_at: "2026-11-01T10:00:00Z" }] },
    rpc: { house_pending_center: STAFF, my_staff_house: [{ house_id: HOUSE_ROW_ID, house_name: "Casa Teste", owner_id: U(9), staff_name: "Ana", perms: ["chat_read", "orders", "members"] }] },
  });
  await page.goto("/atendimento");
  await expect(page.getByRole("heading", { name: "Central de pendências" })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Item reembolso_da_casa" }).getByRole("button")).toHaveCount(0);
  await page.locator("li").filter({ hasText: "Item pedido_para_iniciar" }).getByRole("button", { name: /^Abrir/ }).click();
  await expect(page).toHaveURL(/\/atendimento\?aba=orders/);
  await expect(page.getByRole("tab", { name: "Pedidos" })).toHaveAttribute("aria-selected", "true");
  await page.locator("li").filter({ hasText: "Item conversa_sem_resposta" }).getByRole("button", { name: /^Abrir/ }).click();
  await expect(page).toHaveURL(/\/atendimento\?aba=chat/);
  await expect(page.getByRole("tab", { name: "Conversas" })).toHaveAttribute("aria-selected", "true");
});
