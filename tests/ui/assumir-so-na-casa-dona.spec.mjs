// "Assumir" / "Assistente ativa" só aparece para a casa dona, na conversa com um CLIENTE; nunca no chat de uma casa vista por outra casa.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const ME = U(1), OTHER = U(2);
const casa = { id: ME, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_casa"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }));
const house = { id: U(9), owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null } };
const handoffAtivo = [{ state: "pendente", handler_name: null, since: new Date().toISOString(), active: true }];
const setup = (peerIsHouse) => ({
  rest: { profiles: casa, legal_consents: consents, houses: [house], messages: [] },
  rpc: {
    open_conversation: "c0000000-0000-0000-0000-000000000001",
    peer_info: [{ id: OTHER, name: peerIsHouse ? "Gezebel da Calunga" : "Maria", avatar_url: null, is_house: peerIsHouse, online: true }],
    conversation_handoff_state: handoffAtivo,
    my_conversations: [], is_blocked_by_me: false, report_client_error: true,
  },
});

test("casa vendo o chat de OUTRA casa: sem 'Assumir' nem 'Assistente ativa'", async ({ page }) => {
  await api(page, setup(true));
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByText("Gezebel da Calunga").first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole("button", { name: "Assumir" })).toHaveCount(0);
  await expect(page.getByText(/Assistente ativa|Aguardando você/)).toHaveCount(0);
});

test("casa no chat com um CLIENTE: a faixa com 'Assumir' aparece", async ({ page }) => {
  await api(page, setup(false));
  await page.goto(`/mensagens/${OTHER}`);
  await expect(page.getByText("Maria").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Assumir" })).toBeVisible();
});
