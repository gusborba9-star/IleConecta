import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const OWNER = U(1), HID = U(60), OTHER_OWNER = U(2), OTHER_HID = U(61);
const MINE = U(901), CARD = U(902), THEIRS = U(903);
const PATH = `${OWNER}/1700000000000-abc123.webp`;
const profile = (type) => ({ id: OWNER, account_type: type, display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "termos_cliente", doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }];
const mkHouse = (id, owner, name) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const post = (id, hid, owner, text, o = {}) => ({ id, house_id: hid, kind: "geral", content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: owner }, post_likes: [], post_comments: [], ...o });
const LIST = [post(MINE, HID, OWNER, "Meu post"), post(CARD, HID, OWNER, "Post com foto", { card_style: "total", card_image_path: PATH }), post(THEIRS, OTHER_HID, OTHER_OWNER, "Post de outra casa")];
const setup = (page, { type = "casa", onDelete } = {}) => api(page, {
  rest: { profiles: profile(type), legal_consents: consents, houses: [mkHouse(HID, OWNER, "Casa Axé"), mkHouse(OTHER_HID, OTHER_OWNER, "Outra Casa")], posts: (body, calls, req) => (req?.method === "DELETE" ? (onDelete ? onDelete(req) : [{ id: "x" }]) : LIST) },
  rpc: { post_like_counts: [] },
});
const deletes = (calls) => calls.filter((c) => c.kind === "rest" && c.name === "posts" && c.method === "DELETE");
const more = (page, id) => page.locator(`#post-${id}`).getByRole("button", { name: "Mais opções da publicação" });

test.describe("excluir publicação", () => {
  test("só a casa dona vê o menu; outra casa e cliente não veem", async ({ page }) => {
    await setup(page);
    await page.goto("/comunidade");
    await expect(more(page, MINE)).toBeVisible();
    await expect(more(page, CARD)).toBeVisible();
    await expect(more(page, THEIRS)).toHaveCount(0);
    await expect(page.getByTitle("Mais opções ainda não estão implementadas")).toHaveCount(0);
  });

  test("cliente não vê opção de excluir em nenhum post", async ({ page }) => {
    await setup(page, { type: "cliente" });
    await page.goto("/comunidade");
    await expect(page.locator(`#post-${MINE}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mais opções da publicação" })).toHaveCount(0);
  });

  test("cancelar não apaga; confirmar apaga só aquela publicação e a foto do card", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await more(page, CARD).click();
    await page.getByRole("menuitem", { name: "Excluir publicação" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("curtidas e os comentários");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(deletes(calls)).toHaveLength(0);
    await more(page, CARD).click();
    await page.getByRole("menuitem", { name: "Excluir publicação" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Publicação excluída.")).toBeVisible();
    await expect(page.locator(`#post-${CARD}`)).toHaveCount(0);
    await expect(page.locator(`#post-${MINE}`)).toBeVisible();
    await expect(page.locator(`#post-${THEIRS}`)).toBeVisible();
    const d = deletes(calls);
    expect(d).toHaveLength(1);
    expect(decodeURIComponent(d[0].search)).toContain(`id=eq.${CARD}`);
    const st = calls.filter((c) => c.kind === "storage" && c.method === "DELETE");
    expect(st).toHaveLength(1);
    expect(JSON.stringify(st[0].body)).toContain(PATH); // a foto do card sai do armazenamento junto
  });

  test("post sem foto: apaga sem mexer no armazenamento", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await more(page, MINE).click();
    await page.getByRole("menuitem", { name: "Excluir publicação" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.locator(`#post-${MINE}`)).toHaveCount(0);
    expect(calls.filter((c) => c.kind === "storage" && c.method === "DELETE")).toHaveLength(0);
  });

  test("servidor recusa (nada apagado): a publicação fica e a casa é avisada; a foto NÃO é apagada", async ({ page }) => {
    const calls = await setup(page, { onDelete: () => [] });
    await page.goto("/comunidade");
    await more(page, CARD).click();
    await page.getByRole("menuitem", { name: "Excluir publicação" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Não foi possível excluir agora. Tente novamente.")).toBeVisible();
    await expect(page.locator(`#post-${CARD}`)).toBeVisible();
    expect(calls.filter((c) => c.kind === "storage" && c.method === "DELETE")).toHaveLength(0);
  });

  test("post impulsionado: o banco recusa e a mensagem do motivo aparece; a foto NÃO é apagada", async ({ page }) => {
    const calls = await setup(page, { onDelete: () => ({ status: 400, body: { message: "Esta publicação está impulsionada. Você poderá excluí-la quando o impulsionamento terminar." } }) });
    await page.goto("/comunidade");
    await more(page, CARD).click();
    await page.getByRole("menuitem", { name: "Excluir publicação" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Esta publicação está impulsionada. Você poderá excluí-la quando o impulsionamento terminar.")).toBeVisible();
    await expect(page.locator(`#post-${CARD}`)).toBeVisible();
    expect(calls.filter((c) => c.kind === "storage" && c.method === "DELETE")).toHaveLength(0);
  });

  test("erro técnico qualquer não vaza para a tela: mensagem genérica", async ({ page }) => {
    await setup(page, { onDelete: () => ({ status: 500, body: { message: "relation \"x\" does not exist" } }) });
    await page.goto("/comunidade");
    await more(page, MINE).click();
    await page.getByRole("menuitem", { name: "Excluir publicação" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Não foi possível excluir agora. Tente novamente.")).toBeVisible();
    await expect(page.getByText(/does not exist/)).toHaveCount(0);
  });

  test("celular: alvo de toque de 44 px e sem rolagem lateral", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page);
    await page.goto("/comunidade");
    const b = await more(page, MINE).boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(43); expect(b.height).toBeGreaterThanOrEqual(43);
    await more(page, MINE).click();
    await noHScroll(page);
  });
});
