// Reuniões por vídeo (23/11/2026): lista, banco de minutos, marcar/cancelar, sala embutida só com endereço do provedor e card do painel.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, U, noHScroll } from "./_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";

const ME = U(1), HID = U(60), MID = U(300);
const consentsCli = [{ doc_key: "termos_cliente", doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }];
const consentsCasa = [{ doc_key: "termos_casa", doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }];
const profile = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Minha Casa" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = { id: HID, owner_id: ME, name: "Minha Casa", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null } };
const meeting = (o = {}) => ({ id: MID, house_id: HID, house_name: "Minha Casa", kind: "reuniao", title: "Encontro de membros", starts_at: new Date(Date.now() + 5 * 60000).toISOString(), duration_min: 60, is_host: false, ...o });

const setup = async (page, type, { upcoming = [], bank = null, fn = {}, rest = {} } = {}) =>
  api(page, {
    rest: { profiles: profile(type), legal_consents: type === "casa" ? consentsCasa : consentsCli, houses: type === "casa" ? [house] : [], stories: [], services: [], events: [], posts: [], service_orders: [], ...rest },
    rpc: { video_my_upcoming: upcoming, video_bank: bank, report_client_error: true, moments_feed: [], moments_published_today: 0, video_schedule: MID, video_cancel: null, video_ack: null, video_acked: false, video_house_members: [{ user_id: U(21), name: "Ana Souza", bond: "Filha de santo" }, { user_id: U(22), name: "Bruno Lima", bond: "Ogã" }, { user_id: U(23), name: "Carla Dias", bond: "" }] },
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
  const calls = await setup(page, "casa", { upcoming: [meeting({ is_host: true, starts_at: new Date(Date.now() + 3 * 3600000).toISOString() })], bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
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
  await page.getByTestId("video-aceitar").click();
  const frame = page.getByTestId("video-frame");
  await expect(frame).toHaveAttribute("src", "https://ileconecta.daily.co/ic-1?t=TKN");
  await expect(frame).toHaveAttribute("allow", /camera; microphone/);
});

test("sala LiveKit: chat para todos; só a casa vê Pessoas e o aviso de remoção", async ({ page }) => {
  for (const host of [false, true]) {
    await setup(page, host ? "casa" : "pessoa", { fn: { video: { ok: true, provider: "livekit", url: "wss://ile-teste.livekit.cloud", token: "a.b.c", is_host: host, title: "Encontro", kind: "reuniao", ends_at: new Date(Date.now() + 3600000).toISOString() } } });
    await page.routeWebSocket(/livekit\.cloud/, () => {});
    await page.goto(`/reunioes/${MID}`);
    await page.getByTestId("video-aceitar").click();
    await expect(page.getByTestId("lk-chat")).toBeVisible();
    await page.getByTestId("lk-chat").click();
    await expect(page.getByTestId("lk-chat-panel")).toBeVisible();
    await expect(page.getByTestId("lk-chat-input")).toBeEnabled();
    await expect(page.getByTestId("lk-chat-host-only")).toHaveCount(host ? 1 : 0);
    await expect(page.getByTestId("lk-people")).toHaveCount(host ? 1 : 0);
    if (host) { await page.getByTestId("lk-people").click(); await expect(page.getByTestId("lk-people-panel")).toBeVisible(); }
    await noHScroll(page);
  }
});

test("sala LiveKit: tela própria com controles grandes em português, sem quadro de terceiros", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: true, provider: "livekit", url: "wss://ile-teste.livekit.cloud", token: "a.b.c", is_host: false, title: "Encontro de membros", kind: "reuniao", ends_at: new Date(Date.now() + 3600000).toISOString() } } });
  await page.routeWebSocket(/livekit\.cloud/, () => { /* conexão fica pendente: só conferimos a tela */ });
  await page.goto(`/reunioes/${MID}`);
  await page.getByTestId("video-aceitar").click();
  await expect(page.getByTestId("video-livekit")).toBeVisible();
  await expect(page.getByTestId("video-frame")).toHaveCount(0);
  for (const id of ["lk-mic", "lk-cam", "lk-leave"]) {
    await expect(page.getByTestId(id)).toBeVisible();
    const b = await page.getByTestId(id).boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole("toolbar", { name: "Controles da chamada" })).toBeVisible();
  await expect(page.getByTestId("lk-tile").first()).toBeVisible();
  await noHScroll(page);
});

test("sala LiveKit: servidor fora da LiveKit Cloud é recusado", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: true, provider: "livekit", url: "wss://evil.example.com", token: "a.b.c", title: "x", kind: "reuniao" } } });
  await page.goto(`/reunioes/${MID}`);
  await page.getByTestId("video-aceitar").click();
  await expect(page.getByRole("alert")).toContainText("não respondeu");
  await expect(page.getByTestId("video-livekit")).toHaveCount(0);
});

test("sala: endereço de fora dos provedores é recusado e nada é embutido", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: true, provider: "daily", url: "https://evil.example.com/x", token: "T", title: "x", kind: "reuniao" } } });
  await page.goto(`/reunioes/${MID}`);
  await page.getByTestId("video-aceitar").click();
  await expect(page.getByRole("alert")).toContainText("não respondeu");
  await expect(page.getByTestId("video-frame")).toHaveCount(0);
});

test("sala: recusa do servidor mostra o motivo em português e permite tentar de novo", async ({ page }) => {
  await setup(page, "pessoa", { fn: { video: { ok: false, reason: "sem_minutos" } } });
  await page.goto(`/reunioes/${MID}`);
  await page.getByTestId("video-aceitar").click();
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

test("dona com a sala aberta não vê Cancelar (só entra e encerra pela sala)", async ({ page }) => {
  await setup(page, "casa", { upcoming: [meeting({ is_host: true })], bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/reunioes");
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toHaveCount(0);
});

test("sala em tela cheia: barra com sair, horário de término e Encerrar só para a dona", async ({ page }) => {
  const fn = (host) => ({ video: { ok: true, provider: "daily", url: "https://ileconecta.daily.co/ic-1", token: "TKN", is_host: host, title: "Encontro de membros", kind: "reuniao", ends_at: "2026-12-01T18:30:00.000Z" } });
  await page.route("https://ileconecta.daily.co/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>sala</p>" }));
  await setup(page, "casa", { fn: fn(true) });
  await page.goto(`/reunioes/${MID}`);
  await page.getByTestId("video-aceitar").click();
  await expect(page.getByTestId("video-room")).toBeVisible();
  await expect(page.getByTestId("video-end")).toBeVisible();
  await expect(page.getByText(/Termina às/)).toBeVisible();
  const box = await page.getByTestId("video-frame").boundingBox();
  const vp = page.viewportSize();
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box.height).toBeGreaterThan(vp.height * 0.7);
  await noHScroll(page);
});

test("sala: quem não é dona não vê Encerrar", async ({ page }) => {
  await page.route("https://ileconecta.daily.co/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>sala</p>" }));
  await setup(page, "pessoa", { fn: { video: { ok: true, provider: "daily", url: "https://ileconecta.daily.co/ic-1", token: "TKN", is_host: false, title: "x", kind: "reuniao" } } });
  await page.goto(`/reunioes/${MID}`);
  await page.getByTestId("video-aceitar").click();
  await expect(page.getByTestId("video-frame")).toBeVisible();
  await expect(page.getByTestId("video-end")).toHaveCount(0);
});

test("aviso antes de entrar: nada é pedido ao servidor até aceitar; o aceite registra a versão dos textos", async ({ page }) => {
  await page.route("https://ileconecta.daily.co/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>sala</p>" }));
  const calls = await setup(page, "pessoa", { fn: { video: { ok: true, provider: "daily", url: "https://ileconecta.daily.co/ic-1", token: "TKN", is_host: false, title: "x", kind: "reuniao" } } });
  await page.goto(`/reunioes/${MID}`);
  await expect(page.getByTestId("video-aviso")).toContainText("Esta chamada não é gravada pela plataforma");
  await expect(page.getByTestId("video-frame")).toHaveCount(0);
  expect(calls.some((c) => c.name === "video")).toBe(false);
  await page.getByTestId("video-aceitar").click();
  await expect(page.getByTestId("video-frame")).toBeVisible();
  const ack = calls.find((c) => c.name === "video_ack");
  expect(ack.body.p_meeting).toBe(MID);
  expect(ack.body.p_version).toMatch(/^2026-11-rascunho-\d+$/);
});

test("quem já aceitou esta reunião entra direto, sem ver o aviso nem aceitar de novo", async ({ page }) => {
  await page.route("https://ileconecta.daily.co/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>sala</p>" }));
  const calls = await api(page, {
    rest: { profiles: profile("pessoa"), legal_consents: consentsCli, houses: [], stories: [], services: [], events: [], posts: [], service_orders: [] },
    rpc: { video_my_upcoming: [], video_bank: null, report_client_error: true, moments_feed: [], moments_published_today: 0, video_ack: null, video_acked: true },
    fn: { video: { ok: true, provider: "daily", url: "https://ileconecta.daily.co/ic-1", token: "TKN", is_host: false, title: "x", kind: "reuniao" } },
  });
  await page.goto(`/reunioes/${MID}`);
  await expect(page.getByTestId("video-frame")).toBeVisible();
  await expect(page.getByTestId("video-aviso")).toHaveCount(0);
  expect(calls.some((c) => c.name === "video_ack")).toBe(false);
  expect(calls.find((c) => c.name === "video_acked").body).toMatchObject({ p_meeting: MID });
});

const MEMBROS = [{ user_id: U(21), name: "Ana Souza", bond: "Filha de santo" }, { user_id: U(22), name: "Bruno Lima", bond: "Ogã" }, { user_id: U(23), name: "Carla Dias", bond: "" }];
const agendar = async (page, calls) => {
  await page.getByLabel("Título", { exact: true }).fill("Gira fechada");
  const d = new Date(Date.now() + 2 * 86400000);
  await page.getByLabel("Dia", { exact: true }).fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  await page.getByLabel("Hora", { exact: true }).fill("19:30");
  await page.getByRole("button", { name: "Marcar reunião" }).click();
};

test("casa escolhe quem convidar: busca, marca, e envia só os escolhidos", async ({ page }) => {
  const calls = await setup(page, "casa", { bank: { cap: 6000, used: 10, remaining: 5990, enabled: true } });
  await page.goto("/reunioes");
  await expect(page.getByTestId("video-picker")).toHaveCount(0);
  await page.getByText("Escolher pessoas").click();
  await expect(page.getByTestId("video-picker")).toBeVisible();
  await expect(page.getByLabel("Máx. de pessoas")).toHaveCount(0);
  await expect(page.getByText("Ana Souza")).toBeVisible();
  await page.getByLabel("Buscar membro").fill("bru");
  await expect(page.getByText("Ana Souza")).toHaveCount(0);
  await page.getByLabel("Bruno Lima").check();
  await page.getByLabel("Buscar membro").fill("");
  await page.getByLabel("Carla Dias").check();
  await expect(page.getByTestId("video-picked-count")).toHaveText("2 pessoas escolhidas");
  await agendar(page, calls);
  await expect.poll(() => calls.some((c) => c.name === "video_schedule")).toBe(true);
  const c = calls.find((x) => x.name === "video_schedule").body;
  expect(c.p_invitees.sort()).toEqual([U(22), U(23)].sort());
  expect(c.p_max_participants).toBe(3);
});

test("escolher pessoas sem marcar ninguém avisa na tela e não chama o servidor", async ({ page }) => {
  const calls = await setup(page, "casa", { bank: { cap: 6000, used: 10, remaining: 5990, enabled: true } });
  await page.goto("/reunioes");
  await page.getByText("Escolher pessoas").click();
  await agendar(page, calls);
  await expect(page.getByText("Escolha pelo menos uma pessoa para convidar.")).toBeVisible();
  expect(calls.some((c) => c.name === "video_schedule")).toBe(false);
});

test("'Todos os membros' não manda lista de convidados (o banco convida todos)", async ({ page }) => {
  const calls = await setup(page, "casa", { bank: { cap: 6000, used: 10, remaining: 5990, enabled: true } });
  await page.goto("/reunioes");
  await page.getByTestId("video-audience").getByText("Todos os membros").click();
  await agendar(page, calls);
  await expect.poll(() => calls.some((c) => c.name === "video_schedule")).toBe(true);
  expect(calls.find((x) => x.name === "video_schedule").body.p_invitees).toBeNull();
});

test("acessibilidade e celular: seletor de convidados sem violações e sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setup(page, "casa", { bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/reunioes");
  await page.getByText("Escolher pessoas").click();
  await expect(page.getByText("Ana Souza")).toBeVisible();
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  await noHScroll(page);
  const b = await page.getByLabel("Ana Souza").boundingBox();
  expect(b.width).toBeGreaterThanOrEqual(20);
});

test("tela inicial do cliente: cartão com a reunião aberta e botão Entrar; fechada mostra só o horário", async ({ page }) => {
  await setup(page, "pessoa", { upcoming: [
    meeting({ id: U(301), title: "Gira aberta", starts_at: new Date(Date.now() - 2 * 60000).toISOString() }),
    meeting({ id: U(302), title: "Reunião de logo mais", starts_at: new Date(Date.now() + 90 * 60000).toISOString() }),
  ] });
  await page.goto("/");
  const card = page.getByTestId("video-home-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("video-home-item")).toHaveCount(2);
  await expect(card).toContainText("Sala aberta agora");
  await expect(page.getByTestId("video-home-enter")).toHaveAttribute("href", `/reunioes/${U(301)}`);
  await expect(page.getByTestId("video-home-enter")).toHaveCount(1);
  await expect(card.getByRole("link", { name: "Ver reunião" })).toHaveAttribute("href", "/reunioes");
});

test("tela inicial sem reunião não mostra cartão", async ({ page }) => {
  await setup(page, "pessoa", { upcoming: [] });
  await page.goto("/");
  await expect(page.getByTestId("video-home-card")).toHaveCount(0);
});

test("painel da casa mostra o cartão da reunião aberta", async ({ page }) => {
  await setup(page, "casa", { upcoming: [meeting({ is_host: true, title: "Encontro de membros" })], bank: { cap: 6000, used: 0, remaining: 6000, enabled: true } });
  await page.goto("/");
  await expect(page.getByTestId("video-home-card")).toContainText("Encontro de membros");
  await expect(page.getByTestId("video-home-enter")).toBeVisible();
});
