// Funil atribuído (22/11/2026): o app guarda o token do servidor e o apresenta ao abrir conversa/pedido/reserva; nunca atrapalha quando falha.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const ME = U(5), OTHER = U(1), CONV = "c0000000-0000-0000-0000-000000000001";
const pessoa = { id: ME, account_type: "pessoa", display_name: "Ana Souza", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-11", accepted_at: "2026-11-01T10:00:00Z" }));
const agora = Math.floor(Date.now() / 1000);
const token = (exp) => `${Buffer.from(JSON.stringify({ v: 1, p: U(70), h: U(60), iat: agora - 60, exp, n: "x" })).toString("hex")}.${"a".repeat(64)}`;

const montar = async (page, attribute) => {
  const calls = [];
  await api(page, {
    rest: { profiles: pessoa, legal_consents: consents, messages: [] },
    rpc: { open_conversation: CONV, peer_info: [{ id: OTHER, name: "Casa Axé", avatar_url: null, is_house: true, online: true }], conversation_handoff_state: [], my_conversations: [], is_blocked_by_me: false,
      promo_attribute: (b) => { calls.push(b); return attribute(b); } },
  });
  return calls;
};

test("conversa nova: apresenta o token guardado; servidor 'ok' encerra a tentativa", async ({ page }) => {
  const t = token(agora + 86400);
  await page.addInitScript((v) => localStorage.setItem("ic.promo.tok", JSON.stringify({ [v.h]: v.t })), { h: U(60), t });
  const calls = await montar(page, () => "ok");
  await page.goto(`/mensagens/${OTHER}`);
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ p_token: t, p_ref_type: "conversation", p_ref_id: CONV });
});

test("token vencido não é apresentado e a conversa abre normalmente", async ({ page }) => {
  await page.addInitScript((v) => localStorage.setItem("ic.promo.tok", JSON.stringify({ [v.h]: v.t })), { h: U(60), t: token(agora - 10) });
  const calls = await montar(page, () => "ok");
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByRole("textbox").first()).toBeVisible();
  expect(calls).toHaveLength(0);
});

test("falha do servidor na atribuição nunca atrapalha a conversa", async ({ page }) => {
  await page.addInitScript((v) => localStorage.setItem("ic.promo.tok", JSON.stringify({ [v.h]: v.t })), { h: U(60), t: token(agora + 86400) });
  const calls = await montar(page, () => ({ status: 500, body: { message: "falha simulada" } }));
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByRole("textbox").first()).toBeVisible();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
});
