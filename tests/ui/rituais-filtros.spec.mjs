import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(5), OWN1 = U(1), OWN2 = U(2), H1 = U(60), H2 = U(61);
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const pessoa = (city) => ({ id: ME, account_type: "pessoa", display_name: "Ana Souza", avatar_url: null, bio: null, city, state: city ? "BA" : null, country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = (id, owner, name, city) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city, state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const ev = (id, hid, owner, name, title, days, price, mode = "presencial") => ({ id, house_id: hid, title, description: null, price_cents: price, seats_total: 10, mode, starts_at: new Date(Date.now() + days * 86_400_000).toISOString(), duration_min: 90, status: "publicado", started_at: null, intake_fields: [], houses: { owner_id: owner, name, verified: false } });
const EVENTS = [
  ev(U(90), H1, OWN1, "Casa Axé", "Gira Gratuita", 1, 0),
  ev(U(91), H1, OWN1, "Casa Axé", "Estudo Online", 2, 4000, "distancia"),
  ev(U(92), H2, OWN2, "Casa Longe", "Ritual Caro", 3, 20000),
];
const montar = (page, city = "Salvador") => api(page, {
  rest: { profiles: pessoa(city), legal_consents: consents, houses: [house(H1, OWN1, "Casa Axé", "Salvador"), house(H2, OWN2, "Casa Longe", "Manaus")], events: EVENTS, service_orders: [], reservations: [], reviews: [] },
  rpc: { house_follow_summary: { counts: {}, mine: [OWN1, OWN2] }, my_memberships: [], event_taken: 1, post_like_counts: [], post_comment_counts: [] },
});

test("Rituais: filtros com contagem, URL e limpar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page);
  await page.goto("/rituais");
  await expect(page.getByText("Gira Gratuita")).toBeVisible();
  await expect(page.getByText("Ritual Caro")).toBeVisible();
  const filtros = page.getByRole("group", { name: "Filtros", exact: true });
  await filtros.getByRole("button", { name: /Grátis/ }).click();
  await expect(page.getByText("Gira Gratuita")).toBeVisible();
  await expect(page.getByText("Ritual Caro")).toHaveCount(0);
  await expect(page).toHaveURL(/preco=gratis/);
  await page.reload();
  await expect(page.getByText("Ritual Caro")).toHaveCount(0);
  await page.getByRole("button", { name: /Limpar filtros/ }).click();
  await expect(page.getByText("Ritual Caro")).toBeVisible();
  await noHScroll(page);
});

test("Localização: cartão não bloqueia, 'Agora não' dispensa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page, null);
  await page.goto("/rituais");
  await expect(page.getByText("Gira Gratuita")).toBeVisible();
  const card = page.getByText("Em qual cidade você está?");
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(card).toHaveCount(0);
});
