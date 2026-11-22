// Atendimento da equipe com a mesma conversa limpa da casa (21/11/2026).
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), PERSON = U(2), CONV = "c0000000-0000-0000-0000-000000000001";
const NOME = "Gustavo dos Santos Albuquerque Borba Filho";
const hoje = new Date(); hoje.setHours(10, 30, 0, 0);
const ontem = new Date(hoje.getTime() - 86_400_000);
const m = (n, fromHouse, text, at, extra = {}) => ({ id: U(700 + n), from_house: fromHouse, text, created_at: at.toISOString(), staff_name: null, from_assistant: false, ...extra });

const montar = (page, perms) => api(page, {
  rest: { profiles: { id: ME, account_type: "pessoa", display_name: "Ana", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" }, legal_consents: [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-11", accepted_at: "2026-11-01T10:00:00Z" }] },
  rpc: {
    my_staff_house: [{ house_id: U(9), house_name: "Casa Axé", owner_id: U(8), staff_name: "Ana", perms }],
    staff_conversations: [{ conversation_id: CONV, other_id: PERSON, other_name: NOME, last_text: "Pode me explicar?", last_at: hoje.toISOString() }],
    staff_messages: [m(1, false, "Boa noite, gostaria de saber sobre serviços de prosperidade, com um texto bem comprido para quebrar linha na bolha", ontem), m(2, true, "Boa, temos sim", ontem, { staff_name: "Ana" }), m(3, false, "Pode me explicar?", hoje)],
    house_pending_center: { role: "equipe", house_id: U(9), house_name: "Casa Axé", total: 0, overdue: 0, counts: {}, items: [], to_pay: null },
    conversation_handoff_state: [], report_client_error: true,
  },
});

for (const w of [320, 360, 390]) {
  test(`celular ${w}px: conversa da equipe em largura total, nome inteiro, hora e dia`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await montar(page, ["chat_read", "chat_reply"]);
    await page.goto(`/atendimento?aba=chat&conversa=${CONV}`);
    const nome = page.getByRole("heading", { name: NOME });
    await expect(nome).toBeVisible();
    expect(await nome.evaluate((e) => e.scrollHeight > e.clientHeight + 1)).toBe(false);
    const larg = await page.locator("header").filter({ hasText: NOME }).evaluate((e) => e.getBoundingClientRect().width);
    expect(larg).toBeGreaterThanOrEqual(w - 2);
    const bolha = page.getByText(/Boa noite, gostaria/).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    expect((await bolha.boundingBox()).width).toBeGreaterThan(w * 0.6);
    await expect(page.getByText("10:30").first()).toBeVisible();
    await expect(page.getByText("Ontem", { exact: true })).toBeVisible();
    await expect(page.getByText("Hoje", { exact: true })).toBeVisible();
    await expect(page.getByText("Atendido por Ana")).toBeVisible();
    await expect(page.getByLabel("Mensagem", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
    await noHScroll(page);
  });
}

test("sem permissão de responder: não há campo de mensagem; voltar leva à lista", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await montar(page, ["chat_read"]);
  await page.goto(`/atendimento?aba=chat&conversa=${CONV}`);
  await expect(page.getByText("Seu acesso não inclui responder.")).toBeVisible();
  await expect(page.getByLabel("Mensagem", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar às conversas" }).click();
  await expect(page.getByText(NOME)).toBeVisible();
});
