import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1), HID = U(60), CLIENT = U(5);
const P1 = U(951), P2 = U(952), P3 = U(953);
const profile = { id: CLIENT, account_type: "cliente", display_name: "Cliente Ana", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }];
const house = { id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
const cm = (n, text, user = U(700 + n), name = `Pessoa ${n}`) => ({ id: U(800 + n), user_id: user, text, created_at: `2026-11-17T11:${String(10 + n).padStart(2, "0")}:00Z`, hidden_by_house: false, profiles: { display_name: name, avatar_url: null, account_type: "cliente", city: "Salvador", state: "BA" } });
const post = (id, text) => ({ id, house_id: HID, kind: "geral", content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, edited_at: null, comments_off: false, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: OWNER }, post_likes: [] });

const setup = (page, { comments = () => [cm(1, "Axé lindo"), cm(2, "Gratidão")], counts = () => [{ post_id: P1, n: 2 }, { post_id: P3, n: 150 }], onInsert } = {}) => api(page, {
  rest: { profiles: profile, legal_consents: consents, houses: [house], posts: [post(P1, "Com dois comentários"), post(P2, "Sem comentários"), post(P3, "Muito comentado")],
    post_comments: (body, calls, req) => (req?.method === "POST" ? (onInsert ? onInsert(body) : [{ id: U(999), created_at: "2026-11-17T12:00:00Z" }]) : comments(req)) },
  rpc: { post_like_counts: [], post_comment_counts: () => counts() },
});
const commentCalls = (calls) => calls.filter((c) => c.kind === "rest" && c.name === "post_comments" && c.method !== "POST");

test.describe("comentários sob demanda no feed", () => {
  test("o feed não baixa os comentários: só a contagem; a lista vem ao abrir", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    const card = page.locator(`#post-${P1}`);
    await expect(card.getByRole("button", { name: "2 comentários" })).toBeVisible();
    await expect(page.locator(`#post-${P2}`).getByRole("button", { name: "0 comentários" })).toBeVisible();
    await expect(page.locator(`#post-${P3}`).getByRole("button", { name: "150 comentários" })).toBeVisible();
    expect(commentCalls(calls).length).toBe(0);
    expect(calls.filter((c) => c.kind === "rest" && c.name === "posts").every((c) => !/post_comments/.test(c.search ?? ""))).toBe(true);
    await card.getByRole("button", { name: "2 comentários" }).click();
    await expect(card).toContainText("Axé lindo");
    await expect(card).toContainText("Gratidão");
    await expect(card).toContainText("Pessoa 1");
    expect(commentCalls(calls).length).toBe(1);
    expect(commentCalls(calls)[0].search).toContain(`post_id=eq.${P1}`);
  });

  test("abrir um post não carrega os comentários dos outros", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    await page.locator(`#post-${P1}`).getByRole("button", { name: "2 comentários" }).click();
    await expect(page.locator(`#post-${P1}`)).toContainText("Axé lindo");
    expect(commentCalls(calls).every((c) => c.search.includes(`post_id=eq.${P1}`))).toBe(true);
  });

  test("fechar e abrir de novo não baixa outra vez", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/comunidade");
    const card = page.locator(`#post-${P1}`);
    const btn = card.getByRole("button", { name: "2 comentários" });
    await btn.click(); await expect(card).toContainText("Axé lindo");
    await btn.click(); await expect(card).not.toContainText("Axé lindo");
    await btn.click(); await expect(card).toContainText("Axé lindo");
    expect(commentCalls(calls).length).toBe(1);
  });

  test("mostra 'Carregando' enquanto lê e, se falhar, avisa e deixa tentar de novo até aparecer", async ({ page }) => {
    let tries = 0;
    await setup(page, { comments: () => (++tries === 1 ? { status: 500, body: { message: "falha" } } : [cm(1, "Axé lindo"), cm(2, "Gratidão")]) });
    await page.goto("/comunidade");
    const card = page.locator(`#post-${P1}`);
    await card.getByRole("button", { name: "2 comentários" }).click();
    await expect(card.getByRole("alert")).toContainText("Não foi possível carregar os comentários");
    await expect(card).not.toContainText("Axé lindo");
    await card.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(card).toContainText("Axé lindo");
    await expect(card.getByRole("alert")).toHaveCount(0);
  });

  test("comentário novo aparece na lista e a contagem sobe", async ({ page }) => {
    await setup(page);
    await page.goto("/comunidade");
    const card = page.locator(`#post-${P1}`);
    await card.getByRole("button", { name: "2 comentários" }).click();
    await expect(card).toContainText("Gratidão");
    await card.getByPlaceholder(/coment/i).fill("Meu comentário novo");
    await card.getByRole("button", { name: "Enviar comentário" }).click();
    await expect(card).toContainText("Meu comentário novo");
    await expect(card.getByRole("button", { name: "3 comentários" })).toBeVisible();
  });

  test("post sem comentários abre sem erro e sem chamada demorada", async ({ page }) => {
    const calls = await setup(page, { comments: () => [] });
    await page.goto("/comunidade");
    const card = page.locator(`#post-${P2}`);
    await card.getByRole("button", { name: "0 comentários" }).click();
    await expect(card.getByPlaceholder(/coment/i)).toBeVisible();
    await expect(card.getByRole("alert")).toHaveCount(0);
    expect(commentCalls(calls).length).toBe(1);
  });

  test("se a contagem do servidor falhar, o botão diz só 'Comentários' e a lista ainda abre", async ({ page }) => {
    const calls = await setup(page, { counts: () => ({ status: 500, body: { message: "falha" } }) });
    await page.goto("/comunidade");
    const card = page.locator(`#post-${P1}`);
    await card.getByRole("button", { name: "Comentários", exact: true }).first().click();
    await expect(card).toContainText("Axé lindo");
    expect(commentCalls(calls).length).toBe(1);
  });
});
