// Chat mais limpo (21/11/2026): conversa em largura total no celular, nome inteiro no cabeçalho, hora "10:30" e separador de dia, campo em pílula com as ações dentro.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), OTHER = U(2), CONV = "c0000000-0000-0000-0000-000000000001";
const casa = { id: ME, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_casa"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }));
const house = { id: U(9), owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };
const NOME = "Gustavo dos Santos Albuquerque Borba Filho";
const msg = (n, from, text, at, extra = {}) => ({ id: U(500 + n), conversation_id: CONV, sender_id: from, text, from_assistant: false, created_at: at, read: true, delivered_at: at, deleted_at: null, ...extra });
const hoje = new Date(); hoje.setHours(10, 30, 0, 0);
const ontem = new Date(hoje.getTime() - 86_400_000);
const mensagens = [
  msg(1, OTHER, "Boa noite, gostaria de saber sobre serviços de prosperidade, com um texto bem comprido para quebrar linha na bolha do chat", ontem.toISOString()),
  msg(2, ME, "Boa, temos sim", ontem.toISOString()),
  msg(3, ME, "Posso explicar", new Date(ontem.getTime() + 60_000).toISOString()),
  msg(4, OTHER, "Pode me explicar?", hoje.toISOString()),
];
const montar = (page) => api(page, {
  rest: { profiles: casa, legal_consents: consents, houses: [house], messages: mensagens },
  rpc: { open_conversation: CONV, peer_info: [{ id: OTHER, name: NOME, avatar_url: null, is_house: false, online: true }], conversation_handoff_state: [{ state: "ativa", handler_name: "Casa Axé", since: hoje.toISOString(), active: true }], my_conversations: [], is_blocked_by_me: false, report_client_error: true },
});

for (const w of [320, 360, 390]) {
  test(`celular ${w}px: nome inteiro, bolhas largas, hora e dia, sem rolagem lateral`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await montar(page);
    await page.goto(`/mensagens/${OTHER}`);
    const nome = page.getByRole("button", { name: NOME });
    await expect(nome).toBeVisible();
    // o nome cabe inteiro (até três linhas) sem reticências
    const cortado = await nome.evaluate((e) => e.scrollHeight > e.clientHeight + 1);
    expect(cortado).toBe(false);
    // conversa em largura total (sem moldura de cartão)
    const larg = await page.locator("section").first().evaluate((e) => e.getBoundingClientRect().width);
    expect(larg).toBeGreaterThanOrEqual(w - 2);
    // bolha recebida usa a largura (não espremida)
    const bolha = page.getByText(/Boa noite, gostaria/).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    expect((await bolha.boundingBox()).width).toBeGreaterThan(w * 0.6);
    // hora no formato 10:30 e separadores de dia
    await expect(page.getByText("10:30").first()).toBeVisible();
    await expect(page.getByText("Ontem", { exact: true })).toBeVisible();
    await expect(page.getByText("Hoje", { exact: true })).toBeVisible();
    await noHScroll(page);
  });
}

test("campo em pílula: anexar, propor horário e enviar ao alcance; lixeira só nas minhas, com confirmação", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page);
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByLabel("Mensagem", { exact: true })).toBeVisible();
  for (const n of ["Anexar PDF", "Propor horário", "Enviar mensagem"]) await expect(page.getByRole("button", { name: n })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apagar mensagem" })).toHaveCount(2); // só as minhas
  await page.getByRole("button", { name: "Apagar mensagem" }).first().click();
  await expect(page.getByRole("dialog").getByText("Apagar esta mensagem?")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click(); // desiste de apagar
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page).toHaveURL(/\/mensagens$/);
});

test("foto de perfil da casa: anel e imagem concentricos (sem folga embaixo)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await api(page, { rest: { profiles: casa, legal_consents: consents, houses: [house] }, rpc: {} });
  await page.goto(`/casa/${ME}`);
  await expect(page.getByRole("heading", { level: 1, name: "Casa Axé" })).toBeVisible();
  const anel = page.locator("div.rounded-full.ring-gold\\/60").first();
  const foto = anel.locator("> *").first();
  const [a, f] = await Promise.all([anel.boundingBox(), foto.boundingBox()]);
  const topo = f.y - a.y, base = a.y + a.height - (f.y + f.height), esq = f.x - a.x, dir = a.x + a.width - (f.x + f.width);
  expect(Math.abs(topo - base)).toBeLessThanOrEqual(1);
  expect(Math.abs(esq - dir)).toBeLessThanOrEqual(1);
  expect(Math.abs(topo - esq)).toBeLessThanOrEqual(1);
});

test("celular: ao enviar, cabeçalho, faixa 'Devolver à assistente' e campo ficam parados (a página não rola)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const calls = await api(page, {
    rest: { profiles: casa, legal_consents: consents, houses: [house], messages: (b, c, req) => (req?.method === "POST" ? [] : mensagens), assistants: [{ house_id: U(9), enabled: true, display_name: "Lara" }] },
    rpc: { open_conversation: CONV, peer_info: [{ id: OTHER, name: "Maria", avatar_url: null, is_house: false, online: true }], conversation_handoff_state: [{ state: "ativa", handler_name: "Casa Axé", since: hoje.toISOString(), active: true }] },
  });
  await page.goto(`/mensagens/${OTHER}`);
  const campo = page.getByLabel("Mensagem", { exact: true });
  await expect(campo).toBeVisible();
  const cabecalho = page.locator("header").filter({ has: page.getByRole("button", { name: "Voltar", exact: true }) });
  const rolagem0 = await page.evaluate(() => window.scrollY);
  const antes = [(await cabecalho.boundingBox()).y, (await campo.boundingBox()).y];
  await campo.fill("Boa noite! Posso ajudar.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect.poll(() => calls.some((c) => c.kind === "rest" && c.name === "messages" && c.method === "POST")).toBe(true);
  await page.waitForTimeout(600);
  const depois = [(await cabecalho.boundingBox()).y, (await campo.boundingBox()).y];
  expect(depois[0]).toBe(antes[0]);
  expect(Math.abs(depois[1] - antes[1])).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(rolagem0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
});

test("três autores se distinguem: minha mensagem verde, do cliente neutra, da assistente com tom próprio", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  const lista = [...mensagens, msg(9, ME, "Resposta automática da Lara", hoje.toISOString(), { from_assistant: true })];
  await api(page, {
    rest: { profiles: casa, legal_consents: consents, houses: [house], messages: lista },
    rpc: { open_conversation: CONV, peer_info: [{ id: OTHER, name: "Maria", avatar_url: null, is_house: false, online: true }], conversation_handoff_state: [{ state: "ativa", handler_name: "Casa Axé", since: hoje.toISOString(), active: true }], my_conversations: [] },
  });
  await page.goto(`/mensagens/${OTHER}`);
  const fundo = (t) => page.getByText(t).locator("xpath=ancestor-or-self::div[contains(@class,'rounded-2xl')][1]").evaluate((e) => getComputedStyle(e).backgroundColor);
  const minha = await fundo("Boa, temos sim");
  const cliente = await fundo("Pode me explicar?");
  const assistente = await fundo("Resposta automática da Lara");
  expect(new Set([minha, cliente, assistente]).size).toBe(3);
});

test("perguntas frequentes: casa e cliente veem listas diferentes, sem taxas nem planos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await api(page, { rest: { profiles: casa, legal_consents: consents, houses: [house] } });
  await page.goto("/suporte");
  await expect(page.getByText("Como inicio e concluo um ritual ou trabalho?")).toBeVisible();
  await expect(page.getByText("Como reservo um ritual ou contrato um serviço?")).toHaveCount(0);
  await expect(page.getByText(/Qual é a taxa da plataforma|15%|Stripe/)).toHaveCount(0);
  await noHScroll(page);
});
