// Pedido e convite de membro pelo chat (24/11/2026): a casa convida, a pessoa pede, o outro lado aceita ou recusa.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), OTHER = U(2), CONV = "c0000000-0000-0000-0000-000000000001";
const perfil = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Casa Axé" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const consents = (k) => [k].map((d) => ({ doc_key: d, doc_version: "2026-11-rascunho-23", accepted_at: "2026-11-01T10:00:00Z" }));
const house = { id: U(9), owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };
const base = { open_conversation: CONV, my_conversations: [], is_blocked_by_me: false, report_client_error: true, conversation_handoff_state: [{ state: "ativa", handler_name: "x", since: "2026-11-24T10:00:00Z", active: false }] };
const estado = (o) => ({ house_name: "Casa Axé", is_member: false, i_am_house: false, can_start: false, pending: null, ...o });

const casaMontar = (page, between) => api(page, { rest: { profiles: perfil("casa"), legal_consents: consents("termos_casa"), houses: [house], messages: [] }, rpc: { ...base, peer_info: [{ id: OTHER, name: "Maria", avatar_url: null, is_house: false, online: true }], member_request_between: between, member_request_invite: null } });
const clienteMontar = (page, between, extra = {}) => api(page, { rest: { profiles: perfil("cliente"), legal_consents: consents("termos_cliente"), messages: [] }, rpc: { ...base, peer_info: [{ id: OTHER, name: "Casa Axé", avatar_url: null, is_house: true, online: true }], member_request_between: between, ...extra } });

test("casa: botão para convidar quem já conversou; chama o convite", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const calls = await casaMontar(page, estado({ i_am_house: true, can_start: true }));
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByText("Convidar esta pessoa para ser membro da casa?")).toBeVisible();
  await page.getByRole("button", { name: "Convidar para ser membro" }).click();
  await expect.poll(() => calls.some((c) => c.name === "member_request_invite" && c.body.p_user === OTHER)).toBe(true);
  await noHScroll(page);
});

test("pessoa: convite recebido, aceitar chama a resposta", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const calls = await clienteMontar(page, estado({ pending: { id: U(77), direction: "convite", mine: false, created_at: "2026-11-24T10:00:00Z" } }), { member_request_respond: { ok: true, status: "aceito" } });
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByText("Casa Axé convidou você para ser membro da casa.")).toBeVisible();
  await page.getByRole("button", { name: "Aceitar" }).click();
  await expect.poll(() => calls.find((c) => c.name === "member_request_respond")?.body).toEqual({ p_id: U(77), p_accept: true });
});

test("pessoa: pedido enviado aguarda a casa e pode ser cancelado; recusa chama a resposta com falso na casa", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const calls = await clienteMontar(page, estado({ pending: { id: U(78), direction: "pedido", mine: true, created_at: "2026-11-24T10:00:00Z" } }), { member_request_cancel: null });
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByText(/Aguardando a casa/)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect.poll(() => calls.find((c) => c.name === "member_request_cancel")?.body).toEqual({ p_id: U(78) });
});

test("casa: pedido recebido tem Aceitar e Recusar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const calls = await casaMontar(page, estado({ i_am_house: true, pending: { id: U(79), direction: "pedido", mine: false, created_at: "2026-11-24T10:00:00Z" } }));
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByText("Esta pessoa pediu para ser membro da sua casa.")).toBeVisible();
  await page.getByRole("button", { name: "Recusar" }).click();
  await expect.poll(() => calls.find((c) => c.name === "member_request_respond")?.body).toEqual({ p_id: U(79), p_accept: false });
});

test("sem permissão do banco (casa sem área de membros, bloqueio, espera) o cartão não aparece", async ({ page }) => {
  await casaMontar(page, null);
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByLabel("Mensagem", { exact: true })).toBeVisible();
  await expect(page.getByTestId("member-request-card")).toHaveCount(0);
});
