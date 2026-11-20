import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1), HID = U(60), OTHER_OWNER = U(2), OTHER_HID = U(61), CLIENT = U(5);
const MINE = U(901), CARD = U(902), THEIRS = U(903), OFF = U(904);
const profile = (type, id = OWNER) => ({ id, account_type: type, display_name: type === "casa" ? "Casa Axé" : "Cliente Ana", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-9", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "termos_cliente", doc_version: "2026-11-rascunho-9", accepted_at: "2026-11-01T10:00:00Z" }];
const mkHouse = (id, owner, name) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const cm = (id, text, hidden = false, user = CLIENT) => ({ id, user_id: user, text, created_at: "2026-11-17T11:00:00Z", hidden_by_house: hidden, profiles: { display_name: "Cliente Ana", avatar_url: null, account_type: "cliente", city: "Salvador", state: "BA" } });
const post = (id, hid, owner, text, o = {}) => ({ id, house_id: hid, kind: "geral", content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, edited_at: null, comments_off: false, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: owner }, post_likes: [], post_comments: [], ...o });
const LIST = () => [
  post(MINE, HID, OWNER, "Meu post"),
  post(CARD, HID, OWNER, "Post com foto", { card_style: "total", card_image_path: `${OWNER}/a.webp` }),
  post(THEIRS, OTHER_HID, OTHER_OWNER, "Post de outra casa"),
  post(OFF, HID, OWNER, "Post sem comentários", { comments_off: true, edited_at: "2026-11-17T12:00:00Z" }),
];
const setup = (page, { type = "casa", id = OWNER, onPatch, onHide, locks = () => [] } = {}) => api(page, {
  rest: { profiles: profile(type, id), legal_consents: consents, houses: [mkHouse(HID, OWNER, "Casa Axé"), mkHouse(OTHER_HID, OTHER_OWNER, "Outra Casa")],
    post_comments: [cm(U(701), "Comentário visível"), cm(U(702), "Comentário oculto", true)],
    posts: (body, calls, req) => (req?.method === "PATCH" ? (onPatch ? onPatch(body, req) : [{ id: "x", edited_at: "2026-11-17T13:00:00Z" }]) : LIST()) },
  rpc: { post_like_counts: [], post_comment_counts: [{ post_id: MINE, n: type === "casa" ? 2 : 1 }], my_post_text_locks: () => locks(), house_set_comment_hidden: (b) => (onHide ? onHide(b) : null) },
});
const patches = (calls) => calls.filter((c) => c.kind === "rest" && c.name === "posts" && c.method === "PATCH");
const more = (page, id) => page.locator(`#post-${id}`).getByRole("button", { name: "Mais opções da publicação" });

test.describe("editar publicação e cuidar dos comentários", () => {
  test("menu da casa dona tem editar, desativar comentários e excluir; outros não veem", async ({ page }) => {
    await setup(page);
    await page.goto("/comunidade");
    await more(page, MINE).click();
    for (const n of ["Editar texto", "Desativar comentários", "Excluir publicação"]) await expect(page.getByRole("menuitem", { name: n })).toBeVisible();
    await expect(more(page, THEIRS)).toHaveCount(0);
  });

  test("cliente não vê menu nenhum", async ({ page }) => {
    await setup(page, { type: "cliente", id: CLIENT });
    await page.goto("/comunidade");
    await expect(page.locator(`#post-${MINE}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mais opções da publicação" })).toHaveCount(0);
  });

  test("editar: salva só o texto, mostra 'editado' e manda uma alteração só", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await expect(page.locator(`#post-${MINE}`)).not.toContainText("editado");
    await more(page, MINE).click();
    await page.getByRole("menuitem", { name: "Editar texto" }).click();
    const box = page.getByLabel("Editar texto da publicação");
    await expect(box).toHaveValue("Meu post");
    await box.fill("Meu post corrigido");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Publicação atualizada.")).toBeVisible();
    await expect(page.locator(`#post-${MINE}`)).toContainText("Meu post corrigido");
    await expect(page.locator(`#post-${MINE}`)).toContainText("editado");
    const p = patches(calls);
    expect(p).toHaveLength(1);
    expect(p[0].body).toEqual({ content: "Meu post corrigido" });
    expect(decodeURIComponent(p[0].search)).toContain(`id=eq.${MINE}`);
  });

  test("editar: cancelar não envia nada; texto igual não envia; em branco não salva", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByLabel("Editar texto da publicação").fill("outro");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByLabel("Editar texto da publicação")).toHaveCount(0);
    await expect(page.locator(`#post-${MINE}`)).toContainText("Meu post");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByLabel("Editar texto da publicação")).toHaveCount(0);
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByLabel("Editar texto da publicação").fill("   ");
    await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(patches(calls)).toHaveLength(0);
  });

  test("post com card: limite de 400 no contador e no botão; texto de 2000 vale no post comum", async ({ page }) => {
    await setup(page);
    await page.goto("/comunidade");
    await more(page, CARD).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByLabel("Editar texto da publicação").fill("a".repeat(401));
    await expect(page.locator(`#post-${CARD}`)).toContainText("401/400");
    await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await expect(page.locator(`#post-${CARD}`)).toContainText("A imagem e as letras do card não mudam.");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByLabel("Editar texto da publicação").fill("a".repeat(2000));
    await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  test("servidor recusa a edição: mostra o motivo e mantém o texto antigo", async ({ page }) => {
    const calls = await setup(page, { onPatch: () => ({ status: 400, body: { message: "No Plano Grátis, a divulgação de contatos externos e links não é permitida." } }) });
    await page.goto("/comunidade");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByLabel("Editar texto da publicação").fill("chame no whatsapp");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("No Plano Grátis, a divulgação")).toBeVisible();
    await expect(page.getByLabel("Editar texto da publicação")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator(`#post-${MINE}`)).toContainText("Meu post");
    expect(patches(calls)).toHaveLength(1);
  });

  test("mensagem desconhecida do servidor vira texto genérico (não vaza erro técnico); nada alterado = erro", async ({ page }) => {
    await setup(page, { onPatch: () => ({ status: 400, body: { message: 'duplicate key value violates "x_pkey"' } }) });
    await page.goto("/comunidade");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Editar texto" }).click();
    await page.getByLabel("Editar texto da publicação").fill("novo");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Não foi possível salvar agora. Tente novamente.")).toBeVisible();
    await expect(page.getByText("duplicate key")).toHaveCount(0);
  });

  test("desativar comentários: manda só comments_off e o menu vira 'Ativar comentários'", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Desativar comentários" }).click();
    await expect(page.getByText("Comentários desativados.")).toBeVisible();
    expect(patches(calls)[0].body).toEqual({ comments_off: true });
    await more(page, MINE).click();
    await expect(page.getByRole("menuitem", { name: "Ativar comentários" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Ativar comentários" }).click();
    expect(patches(calls)[1].body).toEqual({ comments_off: false });
  });

  test("cliente em post com comentários desativados: sem caixa de comentar e com aviso; 'editado' aparece", async ({ page }) => {
    await setup(page, { type: "cliente", id: CLIENT });
    await page.goto("/comunidade");
    const card = page.locator(`#post-${OFF}`);
    await expect(card).toContainText("editado");
    await card.getByRole("button", { name: /Comentários/ }).first().click();
    await expect(card).toContainText("A casa desativou os comentários desta publicação.");
    await expect(card.getByPlaceholder("Escreva um comentário...")).toHaveCount(0);
  });

  test("a casa dona, com comentários desativados, ainda vê a caixa e o aviso próprio", async ({ page }) => {
    await setup(page);
    await page.goto("/comunidade");
    const card = page.locator(`#post-${OFF}`);
    await card.getByRole("button", { name: /comentário/i }).last().click();
    await expect(card).toContainText("Você desativou os comentários");
    await expect(card.getByPlaceholder("Escreva um comentário...")).toBeVisible();
  });

  test("ocultar comentário: a casa vê os dois (o oculto fica apagado e rotulado) e chama a função certa", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    const card = page.locator(`#post-${MINE}`);
    await card.getByRole("button", { name: /comentário/ }).first().click();
    await expect(card).toContainText("Comentário visível");
    await expect(card).toContainText("Comentário oculto");
    await expect(card).toContainText("Oculto para o público");
    await card.getByRole("button", { name: "Ocultar" }).click();
    await expect(page.getByText("Comentário ocultado.")).toBeVisible();
    const h = calls.filter((c) => c.kind === "rpc" && c.name === "house_set_comment_hidden");
    expect(h).toHaveLength(1);
    expect(h[0].body).toEqual({ p_comment: U(701), p_hidden: true });
    await card.getByRole("button", { name: "Mostrar" }).first().click();
    await expect(page.getByText("Comentário visível de novo.")).toBeVisible();
  });

  test("ocultar: servidor recusa → o comentário não muda na tela", async ({ page }) => {
    await setup(page, { onHide: () => ({ status: 400, body: { message: "Você só pode cuidar dos comentários das publicações da sua casa." } }) });
    await page.goto("/comunidade");
    const card = page.locator(`#post-${MINE}`);
    await card.getByRole("button", { name: /comentário/ }).first().click();
    await card.getByRole("button", { name: "Ocultar" }).click();
    await expect(page.getByText("Você só pode cuidar dos comentários")).toBeVisible();
    await expect(card.getByRole("button", { name: "Ocultar" })).toHaveCount(1);
  });

  test("cliente comum não vê botão Ocultar", async ({ page }) => {
    await setup(page, { type: "cliente", id: U(77) });
    await page.goto("/comunidade");
    const card = page.locator(`#post-${MINE}`);
    await card.getByRole("button", { name: /comentário/ }).first().click();
    await expect(card).toContainText("Comentário visível");
    await expect(card).not.toContainText("Comentário oculto");
    await expect(card.getByRole("button", { name: "Ocultar" })).toHaveCount(0);
  });

  test("impulsionado com a correção disponível: menu 'Corrigir texto (1 vez)' e aviso com o horário", async ({ page }) => {
    const until = new Date(Date.now() + 40 * 60000).toISOString();
    await setup(page, { locks: () => [{ post_id: MINE, state: "correcao", until }] });
    await page.goto("/comunidade");
    await more(page, MINE).click();
    await page.getByRole("menuitem", { name: "Corrigir texto (1 vez)" }).click();
    await expect(page.locator(`#post-${MINE}`)).toContainText("você pode corrigir o texto uma única vez");
    await expect(page.locator(`#post-${MINE}`)).toContainText("Depois ele fica travado");
    await more(page, CARD).click();
    await expect(page.getByRole("menuitem", { name: "Editar texto" })).toBeVisible(); // post sem impulsionamento segue livre
  });

  test("depois de usar a correção, o menu perde a edição (o banco diz que travou)", async ({ page }) => {
    let used = false;
    await setup(page, { locks: () => [{ post_id: MINE, state: used ? "travado" : "correcao", until: used ? null : new Date(Date.now() + 40 * 60000).toISOString() }], onPatch: () => { used = true; return [{ id: "x", edited_at: "2026-11-17T13:00:00Z" }]; } });
    await page.goto("/comunidade");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Corrigir texto (1 vez)" }).click();
    await page.getByLabel("Editar texto da publicação").fill("Corrigido");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Publicação atualizada.")).toBeVisible();
    await more(page, MINE).click();
    await expect(page.getByRole("menuitem", { name: /texto/i })).toHaveCount(0);
    await expect(page.getByText("Texto travado durante o impulsionamento.")).toBeVisible();
  });

  test("texto travado: só restam desativar comentários e excluir; nada de editar", async ({ page }) => {
    await setup(page, { locks: () => [{ post_id: MINE, state: "travado", until: null }] });
    await page.goto("/comunidade");
    await more(page, MINE).click();
    await expect(page.getByRole("menuitem")).toHaveCount(2);
    await expect(page.getByRole("menuitem", { name: "Desativar comentários" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Excluir publicação" })).toBeVisible();
    await expect(page.getByText("Texto travado durante o impulsionamento.")).toBeVisible();
  });

  test("banco recusa a edição por trava (tela desatualizada): mostra o motivo e não troca o texto", async ({ page }) => {
    await setup(page, { locks: () => [{ post_id: MINE, state: "correcao", until: new Date(Date.now() + 600000).toISOString() }], onPatch: () => ({ status: 400, body: { message: "Esta publicação está impulsionada. O texto só pode ser corrigido uma vez, na primeira hora depois de contratar; agora ele fica travado até o impulsionamento terminar." } }) });
    await page.goto("/comunidade");
    await more(page, MINE).click(); await page.getByRole("menuitem", { name: "Corrigir texto (1 vez)" }).click();
    await page.getByLabel("Editar texto da publicação").fill("Tentativa");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/só pode ser corrigido uma vez/).first()).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator(`#post-${MINE}`)).toContainText("Meu post");
  });
});
