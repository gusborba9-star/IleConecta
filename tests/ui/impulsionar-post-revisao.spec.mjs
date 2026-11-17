import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const OWNER = U(1), HID = U(60), POST = U(901), CARD = U(902);
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-6", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "termos_cliente", doc_version: "2026-11-rascunho-6", accepted_at: "2026-11-01T10:00:00Z" }];
const house = { id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
const post = (id, text, o = {}) => ({ id, house_id: HID, kind: "geral", content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, edited_at: null, comments_off: false, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: OWNER }, post_likes: [], post_comments: [], ...o });
const setup = (page) => api(page, {
  rest: { profiles: profile, legal_consents: consents, houses: [house], posts: [post(POST, "Texto que vai rodar")], services: [], events: [] },
  rpc: { post_like_counts: [], my_post_text_locks: [] },
  fn: { "platform-billing": { url: "http://sb.test/pagamento" } },
});

test.describe("impulsionar publicação: revisão antes de contratar", () => {
  test("mostra a publicação como vai rodar, avisa da trava e só contrata depois de marcar", async ({ page }) => {
    const calls = await setup(page);
    await page.goto(`/impulsionar?item=post:${POST}`);
    await expect(page.getByRole("heading", { name: "Revise antes de contratar" })).toBeVisible();
    await expect(page.getByText("Texto que vai rodar", { exact: true })).toBeVisible();
    await expect(page.getByText(/só pode ser corrigido uma vez, na primeira hora/)).toBeVisible();
    // aceita as condições do pedido e tenta contratar sem revisar
    const agree = page.getByRole("checkbox").filter({ hasNot: page.getByText("Revisei") }).last();
    await agree.check();
    await page.getByRole("button", { name: "Contratar" }).click();
    await expect(page.getByText("Revise a publicação e marque a confirmação antes de contratar.")).toBeVisible();
    expect(calls.filter((c) => c.kind === "fn" && c.name === "platform-billing")).toHaveLength(0);
    await page.getByRole("checkbox", { name: /Revisei o texto e a imagem/ }).check();
    await page.getByRole("button", { name: "Contratar" }).click();
    await expect.poll(() => calls.filter((c) => c.kind === "fn" && c.name === "platform-billing").length).toBe(1);
  });

  test("serviço ou ritual não pedem a revisão da publicação", async ({ page }) => {
    await setup(page);
    await page.goto("/impulsionar");
    await expect(page.getByRole("heading", { name: "Revise antes de contratar" })).toHaveCount(0);
  });

  test("trocar de item volta a exigir a revisão", async ({ page }) => {
    await setup(page);
    await page.goto(`/impulsionar?item=post:${POST}`);
    const rev = page.getByRole("checkbox", { name: /Revisei o texto e a imagem/ });
    await rev.check();
    await page.getByLabel("Item a impulsionar").selectOption("");
    await page.getByLabel("Item a impulsionar").selectOption(`post:${POST}`);
    await expect(rev).not.toBeChecked();
  });
});
