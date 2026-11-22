import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(5), OWN1 = U(1), OWN2 = U(2), H1 = U(60), H2 = U(61);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Ana Souza", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const house = (id, owner, name, city) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city, state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const ev = (id, hid, owner, name, title, days, taken = 2) => ({ id, house_id: hid, title, description: null, price_cents: 5000, seats_total: 10, mode: "presencial", starts_at: new Date(Date.now() + days * 86_400_000).toISOString(), duration_min: 90, status: "publicado", started_at: null, intake_fields: [], houses: { owner_id: owner, name } });
const montar = (page, events, loc = {}) => api(page, { rest: { profiles: { ...pessoa, ...loc }, legal_consents: consents, houses: [house(H1, OWN1, "Casa Axé", "Salvador"), house(H2, OWN2, "Casa Longe", "Manaus")], events, service_orders: [], reservations: [] }, rpc: { house_follow_summary: { counts: {}, mine: [OWN1, OWN2] }, my_memberships: [], event_taken: [], post_like_counts: [], post_comment_counts: [] } });

test("Na sua cidade e em destaque: cartões compactos com data, casa, cidade e vagas; leva à casa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page, [ev(U(90), H1, OWN1, "Casa Axé", "Gira de Caboclos", 3), ev(U(91), H2, OWN2, "Casa Longe", "Ritual da Prosperidade", 1)]);
  await page.goto("/");
  const faixa = page.getByRole("region", { name: "Na sua cidade e em destaque" }).or(page.locator("section[aria-labelledby='na-sua-cidade']"));
  await expect(faixa.getByRole("heading", { name: "Na sua cidade e em destaque" })).toBeVisible();
  const cartoes = faixa.getByRole("link").filter({ hasText: /vagas/ });
  await expect(cartoes).toHaveCount(2);
  await expect(cartoes.first()).toContainText("Gira de Caboclos"); // mesma cidade vem antes, mesmo mais tarde
  await expect(cartoes.first()).toContainText("Salvador");
  await expect(cartoes.first()).toHaveAttribute("href", `/casa/${OWN1}?aba=rituais`);
  const b = await cartoes.first().boundingBox();
  expect(b.height).toBeLessThanOrEqual(140);
  await noHScroll(page);
});

test("sem eventos a faixa não aparece", async ({ page }) => {
  await montar(page, []);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Na sua cidade e em destaque" })).toHaveCount(0);
});

test("sem cidade informada: a faixa não promete cidade, mostra destaques e rituais de qualquer lugar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page, [ev(U(90), H1, OWN1, "Casa Axé", "Gira de Caboclos", 3), ev(U(91), H2, OWN2, "Casa Longe", "Ritual da Prosperidade", 1)], { city: null, state: null });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Próximos rituais e em destaque" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Na sua cidade e em destaque" })).toHaveCount(0);
  await expect(page.getByRole("link").filter({ hasText: /vagas/ })).toHaveCount(2); // nada some por falta de localização
  await expect(page.getByText("Em qual cidade você está?")).toBeVisible(); // pedido discreto, sem bloquear
  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByText("Em qual cidade você está?")).toHaveCount(0);
  await noHScroll(page);
});

test("Viajando: GPS autorizado mostra a cidade do momento e dá para voltar; negado não muda nada", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -23.55, longitude: -46.634 }); // São Paulo
  await montar(page, [ev(U(90), H1, OWN1, "Casa Axé", "Gira de Caboclos", 3), ev(U(91), H2, OWN2, "Casa Longe", "Ritual da Prosperidade", 1)]);
  await page.goto("/descobrir");
  await page.getByRole("button", { name: "Usar minha localização atual" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Você está em São Paulo, SP" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("ic.place.now")))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("ic.place.now"))).not.toMatch(/-23\.55|-46\.63|lat|lon/); // coordenadas não são guardadas
  await page.getByRole("button", { name: "Voltar para Salvador" }).click();
  await expect(page.getByRole("button", { name: "Usar minha localização atual" })).toBeVisible();
  await noHScroll(page);
});

test("Viajando: sem autorização segue normal", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.clearPermissions();
  await montar(page, [ev(U(90), H1, OWN1, "Casa Axé", "Gira de Caboclos", 3)]);
  await page.goto("/");
  await page.getByRole("button", { name: "Usar minha localização atual" }).click();
  await expect(page.getByText(/Sem autorização de localização/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Na sua cidade e em destaque" })).toBeVisible();
});

test("Viajando: os anúncios são pedidos ao banco com a cidade do momento (e sem ela voltam ao perfil)", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -23.55, longitude: -46.634 });
  const bodies = [];
  await api(page, {
    rest: { profiles: pessoa, legal_consents: consents, houses: [house(H1, OWN1, "Casa Axé", "Salvador")], events: [], service_orders: [], reservations: [] },
    rpc: { house_follow_summary: { counts: {}, mine: [OWN1] }, my_memberships: [], event_taken: [], post_like_counts: [], post_comment_counts: [], promotions_visible: (b) => { bodies.push(b ?? {}); return []; } },
  });
  await page.goto("/");
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  expect(bodies[0].p_city).toBeUndefined(); // antes de viajar: perfil
  await page.getByRole("button", { name: "Usar minha localização atual" }).click();
  await expect.poll(() => bodies.some((b) => b.p_city === "São Paulo" && b.p_state === "SP")).toBe(true);
  await page.getByRole("button", { name: "Voltar para Salvador" }).click();
  await expect.poll(() => bodies.length).toBeGreaterThan(2);
  expect(bodies.at(-1).p_city).toBeUndefined();
});
