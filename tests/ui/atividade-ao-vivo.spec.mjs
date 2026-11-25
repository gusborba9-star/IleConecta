// Vídeo 2.0: atividade ao vivo = ritual à distância com sala de vídeo da plataforma (25/11/2026).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, U, noHScroll } from "./_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";

const OWN = U(1), HID = U(81), EID = U(90), RID = U(300), CLI = U(5);
const consentsCasa = [{ doc_key: "termos_casa", doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }];
const consentsCli = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }));
const prof = (id, type, name) => ({ id, account_type: type, display_name: name, avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const houseRow = { id: HID, owner_id: OWN, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "plus", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };
const ev = (mode = "distancia") => ({ id: EID, house_id: HID, title: "Gira online", description: "Gira aberta ao vivo, pela plataforma", price_cents: 5000, seats_total: 20, mode, starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), duration_min: 60, status: "publicado", started_at: null, intake_fields: [], houses: { owner_id: OWN, name: "Casa Axé" } });
const ROOM = [{ id: RID, starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), duration_min: 60 }];
const BANK = { cap: 3000, used: 0, remaining: 3000, enabled: true };

const casa = (page, { room = [], mode = "distancia", bank = BANK } = {}) => api(page, {
  rest: { profiles: prof(OWN, "casa", "Casa Axé"), legal_consents: consentsCasa, houses: [houseRow], events: [ev(mode)], services: [], reservations: [], platform_settings: [] },
  rpc: { video_activity_of: room, video_bank: bank, video_schedule_activity: RID, event_taken: 3, report_client_error: true, moments_feed: [], moments_published_today: 0 },
});

test("casa: ritual à distância mostra 'Abrir sala de vídeo da plataforma' e abre com o ritual certo", async ({ page }) => {
  const calls = await casa(page);
  await page.goto(`/casa/${OWN}?aba=rituais`);
  await expect(page.getByText("Gira online")).toBeVisible();
  await expect(page.getByTestId("ritual-video-open")).toContainText("Plano Plus");
  await page.getByRole("button", { name: /Abrir sala de vídeo da plataforma/ }).click();
  await expect.poll(() => calls.find((c) => c.name === "video_schedule_activity")?.body).toEqual({ p_event: EID, p_duration_min: null });
  await noHScroll(page);
});

test("casa com a sala já aberta: link para gerir; sem botão de abrir de novo", async ({ page }) => {
  await casa(page, { room: ROOM });
  await page.goto(`/casa/${OWN}?aba=rituais`);
  await expect(page.getByTestId("ritual-video-room").getByRole("link", { name: "Abrir a sala de vídeo" })).toHaveAttribute("href", `/reunioes/${RID}`);
  await expect(page.getByTestId("ritual-video-open")).toHaveCount(0);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});

test("casa sem vídeo no plano: nenhuma oferta de sala", async ({ page }) => {
  await casa(page, { bank: { cap: 0, used: 0, remaining: 0, enabled: false } });
  await page.goto(`/casa/${OWN}?aba=rituais`);
  await expect(page.getByText("Gira online")).toBeVisible();
  await expect(page.getByTestId("ritual-video-open")).toHaveCount(0);
  await expect(page.getByTestId("ritual-video-room")).toHaveCount(0);
});

test("ritual presencial não oferece sala de vídeo", async ({ page }) => {
  await casa(page, { mode: "presencial" });
  await page.goto(`/casa/${OWN}?aba=rituais`);
  await expect(page.getByText("Gira online")).toBeVisible();
  await expect(page.getByTestId("ritual-video-open")).toHaveCount(0);
});

const cliente = (page, status) => api(page, {
  rest: { profiles: prof(CLI, "pessoa", "Maria"), legal_consents: consentsCli, houses: [houseRow], events: [ev()], services: [], reservations: [{ id: U(400), event_id: EID, user_id: CLI, status }], platform_settings: [] },
  rpc: { video_activity_of: status === "confirmada" ? ROOM : [], event_taken: 3, report_client_error: true, moments_feed: [], moments_published_today: 0 },
});

test("comprador com vaga confirmada vê 'Entrar na sala de vídeo'", async ({ page }) => {
  await cliente(page, "confirmada");
  await page.goto(`/casa/${OWN}?aba=rituais`);
  await expect(page.getByTestId("ritual-video-room").getByRole("link", { name: "Entrar na sala de vídeo" })).toHaveAttribute("href", `/reunioes/${RID}`);
  await expect(page.getByTestId("ritual-video-room")).toContainText("libera a sua entrada");
});

test("quem ainda não pagou (aguardando pagamento) não vê a sala", async ({ page }) => {
  await cliente(page, "aguardando_pagamento");
  await page.goto(`/casa/${OWN}?aba=rituais`);
  await expect(page.getByText("Gira online")).toBeVisible();
  await expect(page.getByTestId("ritual-video-room")).toHaveCount(0);
});
