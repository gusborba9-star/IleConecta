// Reuniões por vídeo (23/11/2026): lista, banco de minutos, marcar/cancelar, sala embutida só com endereço do provedor e card do painel.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), HID = U(60), MID = U(300);
const consentsCli = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }];
const consentsCasa = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }];
const profile = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Minha Casa" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = { id: HID, owner_id: ME, name: "Minha Casa", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null } };
const meeting = (o = {}) => ({ id: MID, house_id: HID, house_name: "Minha Casa", kind: "reuniao", title: "Encontro de membros", starts_at: new Date(Date.now() + 5 * 60000).toISOString(), duration_min: 60, is_host: false, ...o });

const setup = async (page, type, { upcoming = [], bank = null, fn = {}, rest = {} } = {}) =>
  api(page, {
    rest: { profiles: profile(type), legal_consents: type === "casa" ? consentsCasa : consentsCli, houses: type === "casa" ? [house] : [], stories: [], services: [], events: [], posts: [], service_orders: [], ...rest },
    rpc: { video_my_upcoming: upcoming, video_bank: bank, report_client_error: true, moments_feed: [], moments_published_today: 0, video_schedule: MID, video_cancel: null },
    fn,
  });

test("cliente com reunião aberta: vê na lista e entra pela sala", async ({ page }) => {
  await setup(page, "pessoa", { upcoming: [meeting()] });
  await page.goto("/reunioes");
  await expect(page.getByRole("heading", { name: "Reuniões por vídeo" })).toBeVisible();
  await expect(page.getByText("Encontro de membros")).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", `/reunioes/${MID}`);
  await expect(page.getByTestId("video-form")).toHaveCount(0);
  await noHScroll(page);
});

test("reunião ainda distante mostra 'Abre 10 min antes' e sem botão Entrar", async ({ page }) => {
  await setup(page, "pessoa", { upcoming: [meeting({ starts_at: new Date(Date.now() + 3 * 3600000).toISOString() })] });
  await page.goto("/reunioes");
  await expect(page.getByText("Abre 10 min antes")).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar" })).toHaveCount(0);
});

test("casa com vídeo liberado: banco, aviso de 80% e marcar reunião enviando os dados certos", async ({ page }) => {
  const calls = await setup(page, "casa", { bank: { cap: 6000, used: 4900, remaining: 1100, enabled: true } });
  await page.goto("/reunioes");
  await expect(page.getByTestId("video-bank")).toContainText("1.100");
  await expect(page.getByText(/minutos estão acabando/)).toBeVisible();
  await page.getByLabel("Título").fill("Gira de domingo");
  const d = new Date(Date.now() + 2 * 86400000);
  await page.getByLabel("Dia").fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  await page.getByLabel("Hora").fill("19:30");
  await page.getByRole("button", { name: "Marcar reunião" }).click();
  await expect.poll(() => calls.some((c) => c.name === "video_schedule")).toBe(true);
  const c = calls.find((x) => x.name === "video_schedule").body;
  expect(c).toMatchObject({ p_house: HID, p_kind: "reuniao", p_title: "Gira de domingo", p_duration_min: 60, p_max_participants: 50, p_order: null });
  expect(Number.isNaN(Date.parse(c.p_starts_at))).toBe(false);
});

test("marcar com título vazio avisa na tela e não chama o servidor", async ({ page }) => {
  const calls = await setup(page, "casa", { bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/reunioes");
  await page.getByRole("button", { name: "Marcar reunião" }).click();
  await expect(page.getByText("Dê um título de até 80 letras.")).toBeVisible();
  expect(calls.some((c) => c.name === "video_schedule")).toBe(false);
});

test("casa sem vídeo liberado: aviso e sem formulário", async ({ page }) => {
  await setup(page, "casa", { bank: { cap: 0, used: 0, remaining: 0, enabled: false } });
  await page.goto("/reunioes");
  await expect(page.getByText("ainda não está liberado para a sua casa")).toBeVisible();
  await expect(page.getByTestId("video-form")).toHaveCount(0);
});

test("dona cancela a reunião depois de confirmar", async ({ page }) => {
  const calls = await setup(page, "casa", { upcoming: [meeting({ is_host: true })], bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/reunioes");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar reunião" }).click();
  await expect.poll(() => calls.some((c) => c.name === "video_cancel")).toBe(true);
  expect(calls.find((c) => c.name === "video_cancel").body).toEqual({ p_meeting: MID });
});

test("sala Daily: quadro só com endereço do provedor e permissões de câmera e microfone", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: true, provider: "daily", url: "https://ileconecta.daily.co/ic-1", token: "TKN", is_host: false, title: "Encontro de membros", kind: "reuniao", ends_at: new Date(Date.now() + 3600000).toISOString() } } });
  await page.route("https://ileconecta.daily.co/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>sala</p>" }));
  await page.goto(`/reunioes/${MID}`);
  const frame = page.getByTestId("video-frame");
  await expect(frame).toHaveAttribute("src", "https://ileconecta.daily.co/ic-1?t=TKN");
  await expect(frame).toHaveAttribute("allow", /camera; microphone/);
});

test("sala: endereço de fora dos provedores é recusado e nada é embutido", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: true, provider: "daily", url: "https://evil.example.com/x", token: "T", title: "x", kind: "reuniao" } } });
  await page.goto(`/reunioes/${MID}`);
  await expect(page.getByRole("alert")).toContainText("não respondeu");
  await expect(page.getByTestId("video-frame")).toHaveCount(0);
});

test("sala: recusa do servidor mostra o motivo em português e permite tentar de novo", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: false, reason: "sem_minutos" } } });
  await page.goto(`/reunioes/${MID}`);
  await expect(page.getByRole("alert")).toContainText("minutos de vídeo da casa neste mês acabaram");
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});

test("acessibilidade da tela de reuniões", async ({ page }) => {
  await setup(page, "casa", { upcoming: [meeting({ is_host: true })], bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/reunioes");
  await expect(page.getByTestId("video-form")).toBeVisible();
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});

test("atalho do pedido: Reuniões abre já como consulta com o pedido escolhido e envia o pedido ao marcar", async ({ page }) => {
  const OID = U(900);
  const calls = await setup(page, "casa", {
    bank: { cap: 6000, used: 0, remaining: 6000, enabled: true },
    rest: { service_orders: [{ id: OID, title: "Orientação", status: "confirmado", profiles: { display_name: "Joana" } }] },
  });
  await page.goto(`/reunioes?pedido=${OID}`);
  await expect(page.getByLabel("Tipo")).toHaveValue("consulta");
  await expect(page.getByLabel("Pedido do cliente")).toHaveValue(OID);
  await page.getByLabel("Título").fill("Consulta de orientação");
  const d = new Date(Date.now() + 2 * 86400000);
  await page.getByLabel("Dia").fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  await page.getByLabel("Hora").fill("15:00");
  await page.getByRole("button", { name: "Marcar reunião" }).click();
  await expect.poll(() => calls.some((c) => c.name === "video_schedule")).toBe(true);
  expect(calls.find((x) => x.name === "video_schedule").body).toMatchObject({ p_kind: "consulta", p_order: OID, p_max_participants: 2 });
});

test("pedido na URL que não é um código válido é ignorado (nada é escolhido)", async ({ page }) => {
  await setup(page, "casa", { bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/reunioes?pedido=<script>");
  await expect(page.getByLabel("Tipo")).toHaveValue("reuniao");
});
