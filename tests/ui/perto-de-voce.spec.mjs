import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(5), OWN1 = U(1), OWN2 = U(2), H1 = U(60), H2 = U(61);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Ana Souza", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }));
const house = (id, owner, name, city) => ({ id, owner_id: owner, name, category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city, state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const ev = (id, hid, owner, name, title, days, taken = 2) => ({ id, house_id: hid, title, description: null, price_cents: 5000, seats_total: 10, mode: "presencial", starts_at: new Date(Date.now() + days * 86_400_000).toISOString(), duration_min: 90, status: "publicado", started_at: null, intake_fields: [], houses: { owner_id: owner, name } });
const montar = (page, events) => api(page, { rest: { profiles: pessoa, legal_consents: consents, houses: [house(H1, OWN1, "Casa Axé", "Salvador"), house(H2, OWN2, "Casa Longe", "Manaus")], events, service_orders: [], reservations: [] }, rpc: { my_memberships: [], event_taken: [], post_like_counts: [], post_comment_counts: [] } });

test("Perto de você: cartões compactos com data, casa, cidade e vagas; leva à casa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page, [ev(U(90), H1, OWN1, "Casa Axé", "Gira de Caboclos", 3), ev(U(91), H2, OWN2, "Casa Longe", "Ritual da Prosperidade", 1)]);
  await page.goto("/");
  const faixa = page.getByRole("region", { name: "Perto de você" }).or(page.locator("section[aria-labelledby='perto-de-voce']"));
  await expect(faixa.getByRole("heading", { name: "Perto de você" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Perto de você" })).toHaveCount(0);
});
