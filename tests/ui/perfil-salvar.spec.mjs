// Salvar o perfil: sucesso, e falha inesperada do servidor (como a do gatilho do estado) mostra aviso E aparece em Saúde da plataforma.
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

const profile = { id: U(1), account_type: "pessoa", display_name: "Gustavo", avatar_url: null, bio: null, city: "Porto Alegre", state: "RS", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }));
const base = (patch) => ({ rest: { profiles: (b, c, r) => (r?.method === "PATCH" ? patch(b) : profile), legal_consents: consents }, rpc: { report_client_error: true } });

test("salva o perfil: manda só campos permitidos e avisa que deu certo", async ({ page }) => {
  const calls = await api(page, base(() => ({ status: 204, body: null })));
  await page.goto("/perfil");
  await page.getByRole("button", { name: /Editar perfil/ }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Gustavo Borba");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Perfil atualizado.")).toBeVisible();
  const patch = calls.find((c) => c.kind === "rest" && c.name === "profiles" && c.method === "PATCH");
  expect(patch.body.display_name).toBe("Gustavo Borba");
  expect(Object.keys(patch.body).every((k) => ["display_name", "bio", "city", "state", "avatar_url"].includes(k))).toBe(true);
  expect(calls.filter((c) => c.name === "report_client_error").length).toBe(0);
});

test("falha do servidor ao salvar: aviso ao usuário e relato em Saúde da plataforma (com a causa, sem identificar ninguém)", async ({ page }) => {
  const calls = await api(page, base(() => ({ status: 403, body: { code: "42501", message: "permission denied for function br_uf_from_text" } })));
  await page.goto("/perfil");
  await page.getByRole("button", { name: /Editar perfil/ }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Gustavo Borba");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Não foi possível salvar agora. Tente novamente.")).toBeVisible();
  await expect.poll(() => calls.filter((c) => c.name === "report_client_error").length).toBe(1);
  const rel = calls.find((c) => c.name === "report_client_error").body;
  expect(rel.p_message).toMatch(/salvar perfil falhou \(42501\): permission denied for function br_uf_from_text/);
  expect(JSON.stringify(rel)).not.toMatch(/Gustavo|@/);
});
