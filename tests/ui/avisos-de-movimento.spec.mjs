import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const OWNER = U(1), HID = U(60), POST = U(901), OTHER = U(902);
const profile = (type) => ({ id: OWNER, account_type: type, display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-6", accepted_at: "2026-11-01T10:00:00Z" }, { doc_key: "termos_cliente", doc_version: "2026-11-rascunho-6", accepted_at: "2026-11-01T10:00:00Z" }];
const house = { id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "gratis", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
const post = (id, text) => ({ id, house_id: HID, kind: "geral", content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: OWNER }, post_likes: [], post_comments: [] });
const notice = (o) => ({ id: U(700 + (o.n ?? 0)), text: "x", href: null, read: false, created_at: "2026-11-17T11:00:00Z", ...o });
const setup = (page, { type = "casa", prefs = null, notifs = [] } = {}) => api(page, { rest: { profiles: profile(type), legal_consents: consents, houses: [house], posts: [post(OTHER, "Outra publicação"), post(POST, "Gira de abertura")], notifications: notifs, notification_prefs: prefs ?? [] }, rpc: { post_like_counts: [] } });
const sw = (page, name) => page.getByRole("switch", { name });
const upserts = (calls) => calls.filter((c) => c.kind === "rest" && c.name.startsWith("notification_prefs") && c.body && !Array.isArray(c.body)).map((c) => c.body);

test.describe("avisos de movimento (curtida, comentário, seguidor)", () => {
  test("casa vê o cartão, tudo ligado por padrão, e desliga só um tipo", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Avisos de movimento" })).toBeVisible();
    for (const n of ["Comentários", "Curtidas", "Novos seguidores"]) await expect(sw(page, n)).toHaveAttribute("aria-checked", "true");
    await sw(page, "Curtidas").click();
    await expect(sw(page, "Curtidas")).toHaveAttribute("aria-checked", "false");
    await expect(sw(page, "Comentários")).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => upserts(calls).filter((b) => "notify_likes" in b).length).toBeGreaterThan(0);
    const body = upserts(calls).find((b) => "notify_likes" in b);
    expect(body.notify_likes).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["notify_likes", "updated_at", "user_id"]); // só a coluna mexida
    expect(body.user_id).toBe(OWNER);
    await noHScroll(page);
  });

  test("preferência salva como desligada aparece desligada; valor estranho não desliga", async ({ page }) => {
    await setup(page, { prefs: { user_id: OWNER, notify_likes: false, notify_comments: null, notify_follows: true } });
    await page.goto("/");
    await expect(sw(page, "Curtidas")).toHaveAttribute("aria-checked", "false");
    await expect(sw(page, "Comentários")).toHaveAttribute("aria-checked", "true");
    await expect(sw(page, "Novos seguidores")).toHaveAttribute("aria-checked", "true");
  });

  test("falha ao salvar: volta ao estado anterior e avisa", async ({ page }) => {
    await api(page, { rest: { profiles: profile("casa"), legal_consents: consents, houses: [house], posts: [], notifications: [], notification_prefs: (body) => (body ? { status: 400, body: { message: "x" } } : []) } });
    await page.goto("/");
    await sw(page, "Novos seguidores").click();
    await expect(page.getByText("Não foi possível salvar. Tente novamente.")).toBeVisible();
    await expect(sw(page, "Novos seguidores")).toHaveAttribute("aria-checked", "true");
  });

  test("cliente não vê o cartão (é coisa da casa)", async ({ page }) => {
    await setup(page, { type: "cliente" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Avisos de movimento" })).toHaveCount(0);
  });

  test("sino mostra os 3 tipos e o toque no aviso abre o feed já na publicação, destacada", async ({ page }) => {
    await setup(page, { notifs: [
      notice({ n: 1, text: "Carla e mais 2 pessoas curtiram sua publicação.", href: `/comunidade?post=${POST}`, kind: "like" }),
      notice({ n: 2, text: "Ana começou a seguir você.", href: "/pessoas", kind: "follow", created_at: "2026-11-17T10:30:00Z" }),
      notice({ n: 3, text: "Beto comentou 2 vezes na sua publicação.", href: `/comunidade?post=${OTHER}`, kind: "comment", created_at: "2026-11-17T10:00:00Z" }),
    ] });
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Notificações/ }).click();
    await expect(page.getByText("Carla e mais 2 pessoas curtiram sua publicação.")).toBeVisible();
    await expect(page.getByText("Ana começou a seguir você.")).toBeVisible();
    await expect(page.getByText("Beto comentou 2 vezes na sua publicação.")).toBeVisible();
    await page.getByText("Carla e mais 2 pessoas curtiram sua publicação.").click();
    await expect(page).toHaveURL(new RegExp(`/comunidade\\?post=${POST}`));
    await expect(page.locator(`#post-${POST}`)).toHaveAttribute("data-flash", "1");
    await expect(page.locator(`#post-${OTHER}`)).not.toHaveAttribute("data-flash", "1");
    await expect(page.locator(`#post-${POST}`)).toContainText("Gira de abertura");
    await expect(page.locator(`#post-${POST}`)).not.toHaveAttribute("data-flash", "1", { timeout: 6000 }); // o destaque some sozinho
  });

  test("link para publicação que não existe mais não quebra a tela", async ({ page }) => {
    await setup(page);
    await page.goto(`/comunidade?post=${U(999)}`);
    await expect(page.locator(`#post-${POST}`)).toBeVisible();
    await expect(page.locator("[data-flash]")).toHaveCount(0);
  });
});
