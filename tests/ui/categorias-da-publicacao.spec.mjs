import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const OWNER = U(1), HID = U(60), OTHER_OWNER = U(2), OTHER_HID = U(61), CLIENT = U(5);
const profile = (type, id, city = "Salvador") => ({ id, account_type: type, display_name: type === "casa" ? "Casa Axé" : "Cliente Ana", avatar_url: null, bio: null, city, state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const consents = ["termos_casa", "termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const mkHouse = (id, owner, name, city) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city, state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const post = (id, hid, owner, text, category) => ({ id, house_id: hid, kind: "geral", category, content: text, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, edited_at: null, comments_off: false, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: owner }, post_likes: [] });
const LIST = [post(U(901), HID, OWNER, "Gira de sábado", "evento"), post(U(902), HID, OWNER, "Aviso do mês", "aviso"), post(U(903), OTHER_HID, OTHER_OWNER, "Texto sobre ervas", "ensinamento"), post(U(904), OTHER_HID, OTHER_OWNER, "Conversa livre", "geral")];
const setup = (page, type, id, extra = {}) => api(page, {
  rest: { profiles: profile(type, id), legal_consents: consents, houses: (b, c, req) => { const all = [mkHouse(HID, OWNER, "Casa Axé", "Salvador"), mkHouse(OTHER_HID, OTHER_OWNER, "Casa Longe", "Manaus")]; const m = decodeURIComponent(req.search).match(/owner_id=eq\.([\w-]+)/); return m ? all.filter((h) => h.owner_id === m[1]) : all; },
    posts: (body, calls, req) => (req?.method === "POST" ? { id: U(950), created_at: "2026-11-21T10:00:00Z" } : LIST), ...extra },
  rpc: { post_like_counts: [], post_comment_counts: [], my_memberships: [] },
});

test("cliente filtra por categoria e por cidade", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, "cliente", CLIENT);
  await page.goto("/comunidade");
  await expect(page.getByText("Conversa livre")).toBeVisible();
  await page.getByRole("button", { name: "Avisos" }).click();
  await expect(page.getByText("Aviso do mês")).toBeVisible();
  await expect(page.getByText("Gira de sábado")).toHaveCount(0);
  await page.getByRole("button", { name: "Perto de mim" }).click();
  await expect(page.getByText("Gira de sábado")).toBeVisible();
  await expect(page.getByText("Texto sobre ervas")).toHaveCount(0);
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByText("Texto sobre ervas")).toBeVisible();
  await noHScroll(page);
});

test("casa escolhe a categoria e ela vai no envio", async ({ page }) => {
  const calls = await setup(page, "casa", OWNER);
  await page.goto("/comunidade");
  await page.getByRole("button", { name: /Diga algo/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Giras e eventos" }).click();
  await page.getByLabel("Texto da publicação").fill("Gira aberta sexta");
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect.poll(() => calls.find((c) => c.kind === "rest" && c.name === "posts" && c.method === "POST")?.body?.category).toBe("evento");
});

const EV = (extra = {}) => ({ id: U(80), house_id: HID, title: "Gira de Caboclos", description: null, price_cents: 5000, seats_total: 10, mode: "presencial", starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 90, status: "publicado", started_at: null, intake_fields: [], houses: { owner_id: OWNER, name: "Casa Axé" }, ...extra });

test("post com ritual anexado mostra o cartão da gira com Reservar vaga; sem vaga vira Ver gira", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, "cliente", CLIENT, { events: [EV()], posts: [{ ...post(U(905), HID, OWNER, "Venha para a gira", "evento"), event_id: U(80) }] });
  await page.goto("/comunidade");
  const cartao = page.getByRole("link", { name: "Reservar vaga" });
  await expect(cartao).toHaveAttribute("href", `/casa/${OWNER}?aba=rituais`);
  await expect(page.getByText("Gira de Caboclos").first()).toBeVisible();
  await noHScroll(page);
});

test("casa em Giras e eventos escolhe o ritual e o envio leva event_id; só aparece ritual aberto e futuro", async ({ page }) => {
  const calls = await setup(page, "casa", OWNER, { events: [EV(), EV({ id: U(81), title: "Já passou", starts_at: new Date(Date.now() - 86_400_000).toISOString() }), EV({ id: U(82), title: "Rascunho", status: "rascunho" })] });
  await page.goto("/comunidade");
  await page.getByRole("button", { name: /Diga algo/ }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByLabel(/Anexar um ritual/)).toHaveCount(0);
  await d.getByRole("button", { name: "Giras e eventos" }).click();
  const sel = d.getByLabel(/Anexar um ritual/);
  await expect(sel.locator("option")).toHaveCount(2); // "Sem ritual" + a gira aberta
  await sel.selectOption(U(80));
  await d.getByLabel("Texto da publicação").fill("Gira aberta sexta");
  await d.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect.poll(() => calls.find((c) => c.kind === "rest" && c.name === "posts" && c.method === "POST")?.body?.event_id).toBe(U(80));
});
