import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1), HID = U(60), POST = U(901), PLAIN = U(902);
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "termos_cliente", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }];
const house = { id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
const post = (id, text) => ({ id, house_id: HID, kind: "geral", content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, edited_at: null, comments_off: false, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: OWNER }, post_likes: [], post_comments: [] });
const deadline = new Date(Date.now() + 5 * 86400000).toISOString();
const setup = (page, { state = () => "reembolsavel", onDelete } = {}) => api(page, {
  rest: { profiles: profile, legal_consents: consents, houses: [house], posts: (b, c, req) => (req?.method === "DELETE" ? (onDelete ? onDelete(req) : [{ id: "x" }]) : [post(POST, "Post impulsionado"), post(PLAIN, "Post comum")]) },
  rpc: { post_like_counts: [], my_post_text_locks: [], my_post_delete_states: () => { const s = state(); return s ? [{ post_id: POST, state: s, deadline: s === "reembolsavel" ? deadline : null }] : []; } },
});
const more = (page, id) => page.locator(`#post-${id}`).getByRole("button", { name: "Mais opções da publicação" });
const askDelete = async (page, id) => { await more(page, id).click(); await page.getByRole("menuitem", { name: "Excluir publicação" }).click(); };
const deletes = (calls) => calls.filter((c) => c.kind === "rest" && c.name === "posts" && c.method === "DELETE");

test.describe("excluir publicação impulsionada: caminho pelo reembolso", () => {
  test("dentro dos 7 dias: explica, mostra o prazo e leva a Pedidos e validações; não oferece excluir", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await askDelete(page, POST);
    const d = page.getByRole("alertdialog");
    await expect(d).toContainText("Esta publicação está impulsionada");
    await expect(d).toContainText("não pode ser excluída agora");
    await expect(d).toContainText("Cancelar agora");
    await expect(d).toContainText("disponível até");
    await expect(d).toContainText("o dia em andamento não é devolvido");
    await expect(d.getByRole("button", { name: "Excluir", exact: true })).toHaveCount(0);
    await expect(d.getByRole("button", { name: "Excluir agora" })).toHaveCount(0);
    await d.getByRole("button", { name: "Ir para Pedidos e validações" }).click();
    await expect(page).toHaveURL(/\/planos#pedidos$/);
    expect(deletes(calls)).toHaveLength(0);
  });

  test("depois de 7 dias / sem dias a devolver: só avisa, sem botão para o reembolso", async ({ page }) => {
    const calls = await setup(page, { state: () => "aguardar" });
    await page.goto("/comunidade");
    await askDelete(page, POST);
    const d = page.getByRole("alertdialog");
    await expect(d).toContainText("só poderá ser excluída quando o impulsionamento terminar");
    await expect(d.getByRole("button", { name: "Ir para Pedidos e validações" })).toHaveCount(0);
    await d.getByRole("button", { name: "Entendi" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(deletes(calls)).toHaveLength(0);
  });

  test("reembolso em andamento: pede para voltar em alguns minutos", async ({ page }) => {
    await setup(page, { state: () => "reembolso_pendente" });
    await page.goto("/comunidade");
    await askDelete(page, POST);
    await expect(page.getByRole("alertdialog")).toContainText("O reembolso está sendo concluído");
    await expect(page.getByRole("button", { name: /Excluir/ })).toHaveCount(0);
  });

  test("reembolso concluído: aviso honesto sobre os dias iniciados e escolha [Manter até o fim] / [Excluir agora]", async ({ page }) => {
    const calls = await setup(page, { state: () => "liberado" });
    await page.goto("/comunidade");
    await askDelete(page, POST);
    const d = page.getByRole("alertdialog");
    await expect(d).toContainText("O reembolso foi concluído");
    await expect(d).toContainText("foram pagos e não são devolvidos: eles param quando a publicação sai do ar");
    await d.getByRole("button", { name: "Manter até o fim" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(deletes(calls)).toHaveLength(0);
    await askDelete(page, POST);
    await page.getByRole("button", { name: "Excluir agora" }).click();
    await expect(page.getByText("Publicação excluída.")).toBeVisible();
    await expect(page.locator(`#post-${POST}`)).toHaveCount(0);
    expect(deletes(calls)).toHaveLength(1);
  });

  test("ao abrir a exclusão a tela pergunta de novo ao banco (reembolso concluído enquanto estava em outra tela)", async ({ page }) => {
    let s = "reembolsavel";
    await setup(page, { state: () => s });
    await page.goto("/comunidade");
    s = "liberado";
    await askDelete(page, POST);
    await expect(page.getByRole("alertdialog")).toContainText("O reembolso foi concluído");
  });

  test("banco recusa por reembolso pendente: a mensagem do banco aparece e o post fica", async ({ page }) => {
    await setup(page, { state: () => "liberado", onDelete: () => ({ status: 400, body: { message: "O reembolso desta publicação ainda está sendo concluído. Tente excluir em alguns minutos." } }) });
    await page.goto("/comunidade");
    await askDelete(page, POST);
    await page.getByRole("button", { name: "Excluir agora" }).click();
    await expect(page.getByText("O reembolso desta publicação ainda está sendo concluído.")).toBeVisible();
    await expect(page.locator(`#post-${POST}`)).toBeVisible();
  });

  test("post comum segue com a confirmação de sempre", async ({ page }) => {
    await setup(page);
    await page.goto("/comunidade");
    await askDelete(page, PLAIN);
    await expect(page.getByRole("alertdialog")).toContainText("As curtidas e os comentários dela também serão apagados");
    await expect(page.getByRole("button", { name: "Excluir", exact: true })).toBeVisible();
  });
});

test("/planos#pedidos abre a seção Pedidos e validações já aberta; sem o atalho ela fica recolhida", async ({ page }) => {
  await setup(page);
  await page.goto("/planos");
  await expect(page.locator("details#pedidos")).toBeAttached();
  await expect(page.locator("details#pedidos")).not.toHaveAttribute("open", "");
  await page.goto("/planos#pedidos");
  await expect(page.locator("details#pedidos")).toHaveAttribute("open", "");
});

const CH = U(555), SVC = U(777);
const promoItem = (o = {}) => ({ id: U(444), kind: "boost", scope: "cidade", item_type: "post", item_id: POST, title: "Post impulsionado", days: 10, status: "ativa", charge_id: CH, paid_cents: 19900, starts_at: "2026-11-17T10:00:00Z", ends_at: "2026-11-27T10:00:00Z", running: true, queued: false, paused: false, days_left: 8, days_used: 2, refund_cents: 15920, refund_days: 8, refund_deadline: new Date(Date.now() + 5 * 86400000).toISOString(), views: 0, opens: 0, ...o });
const setupOrders = (page, { item = promoItem(), refund = { status: "done" } } = {}) => api(page, {
  rest: { profiles: profile, legal_consents: consents, houses: [house], posts: [post(POST, "Post impulsionado")] },
  rpc: { post_like_counts: [], my_post_text_locks: [], my_post_delete_states: [], my_promotions: { has_house: true, window_days: 7, items: [item] }, house_set_post_delete_after_refund: null },
  fn: { "platform-billing": refund },
});
const openItem = async (page, name) => { await page.goto("/planos#pedidos"); await page.locator("details#pedidos summary").filter({ hasText: "Pedidos e validações" }).first().waitFor(); await page.locator("details#pedidos details", { hasText: name }).first().locator("summary").click(); };
const flagCalls = (calls) => calls.filter((c) => c.kind === "rpc" && c.name === "house_set_post_delete_after_refund");
const refundCalls = (calls) => calls.filter((c) => c.kind === "fn" && c.name === "platform-billing" && c.body?.action === "promo_refund");

test.describe("Pedidos e validações: Cancelar agora numa publicação impulsionada", () => {
  test("[Continuar até o final] fecha sem pedir nada", async ({ page }) => {
    const calls = await setupOrders(page);
    await openItem(page, "Post impulsionado");
    await page.getByRole("button", { name: /excluir publicação e solicitar reembolso/ }).click();
    const d = page.getByRole("alertdialog");
    await expect(d).toContainText("Cancelar agora e excluir a publicação?");
    await expect(d).toContainText("R$ 159,20");
    await expect(d).toContainText("não é devolvido e para quando a publicação sair do ar");
    await expect(d).toContainText("assim que o estorno for confirmado");
    await expect(d).toContainText("outra compra");
    await d.getByRole("button", { name: "Continuar até o final" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(flagCalls(calls)).toHaveLength(0);
    expect(refundCalls(calls)).toHaveLength(0);
  });

  test("[Cancelar agora]: marca a exclusão e pede o reembolso, nessa ordem, uma vez só", async ({ page }) => {
    const calls = await setupOrders(page);
    await openItem(page, "Post impulsionado");
    await page.getByRole("button", { name: /excluir publicação e solicitar reembolso/ }).click();
    await page.getByRole("button", { name: "Cancelar agora" }).click();
    await expect(page.getByText(/Reembolso aprovado e publicação excluída/)).toBeVisible();
    const order = calls.filter((c) => (c.kind === "rpc" && c.name === "house_set_post_delete_after_refund") || (c.kind === "fn" && c.body?.action === "promo_refund")).map((c) => (c.kind === "rpc" ? `flag:${c.body.p_on}` : "refund"));
    expect(order).toEqual(["flag:true", "refund"]);
    expect(flagCalls(calls)[0].body).toEqual({ p_charge: CH, p_on: true });
    expect(refundCalls(calls)).toHaveLength(1);
  });

  test("estorno ainda pendente: avisa que a publicação sai quando o estorno for confirmado", async ({ page }) => {
    await setupOrders(page, { refund: { status: "pending" } });
    await openItem(page, "Post impulsionado");
    await page.getByRole("button", { name: /excluir publicação e solicitar reembolso/ }).click();
    await page.getByRole("button", { name: "Cancelar agora" }).click();
    await expect(page.getByText("A publicação será excluída assim que o estorno for confirmado.")).toBeVisible();
  });

  test("o pedido de reembolso falha: a marca de excluir é desfeita e a casa é avisada", async ({ page }) => {
    const calls = await setupOrders(page, { refund: { status: 400, body: { error: "Pagamento sem referência do provedor." } } });
    await openItem(page, "Post impulsionado");
    await page.getByRole("button", { name: /excluir publicação e solicitar reembolso/ }).click();
    await page.getByRole("button", { name: "Cancelar agora" }).click();
    await expect(page.getByText("Pagamento sem referência do provedor.")).toBeVisible();
    expect(flagCalls(calls).map((c) => c.body.p_on)).toEqual([true, false]);
  });

  test("não conseguiu marcar a exclusão: nem pede o reembolso", async ({ page }) => {
    const calls = await api(page, {
      rest: { profiles: profile, legal_consents: consents, houses: [house], posts: [post(POST, "Post impulsionado")] },
      rpc: { post_like_counts: [], my_post_text_locks: [], my_post_delete_states: [], my_promotions: { has_house: true, window_days: 7, items: [promoItem()] }, house_set_post_delete_after_refund: { status: 400, body: { message: "erro" } } },
    });
    await openItem(page, "Post impulsionado");
    await page.getByRole("button", { name: /excluir publicação e solicitar reembolso/ }).click();
    await page.getByRole("button", { name: "Cancelar agora" }).click();
    await expect(page.getByText("Não foi possível preparar o pedido agora.")).toBeVisible();
    expect(refundCalls(calls)).toHaveLength(0);
  });

  test("impulsionamento de serviço: mesma confirmação, sem excluir nada e sem marcar", async ({ page }) => {
    const calls = await setupOrders(page, { item: promoItem({ item_type: "service", item_id: SVC, title: "Consulta" }) });
    await openItem(page, "Consulta");
    await page.getByRole("button", { name: "Cancelar dias não iniciados e solicitar reembolso" }).click();
    const d = page.getByRole("alertdialog");
    await expect(d).toContainText("Cancelar agora?");
    await expect(d).not.toContainText("excluir a publicação");
    await d.getByRole("button", { name: "Cancelar agora" }).click();
    await expect.poll(() => refundCalls(calls).length).toBe(1);
    expect(flagCalls(calls)).toHaveLength(0);
  });
});
