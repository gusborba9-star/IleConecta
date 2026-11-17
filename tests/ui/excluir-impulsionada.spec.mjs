import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1), HID = U(60), POST = U(901), PLAIN = U(902);
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-5", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "termos_cliente", doc_version: "2026-11-rascunho-5", accepted_at: "2026-11-01T10:00:00Z" }];
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
    await expect(d).toContainText("peça o reembolso dos dias de impulsionamento que ainda não começaram");
    await expect(d).toContainText("disponível até");
    await expect(d).toContainText("Os dias que já começaram não são devolvidos");
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
