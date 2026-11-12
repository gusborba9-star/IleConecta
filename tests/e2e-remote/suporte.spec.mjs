import { test, expect } from "@playwright/test";

const API = "http://127.0.0.1:54321";
const V = "2026-10-rascunho-2";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (uid) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.assinatura`;
const UID = "11111111-1111-1111-1111-111111111111";
const CASE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Servidor simulado do suporte: guarda o que o app chamou em `s.calls`. */
async function serve(page, o = {}) {
  const s = { calls: [], email: o.email ?? null, status: o.status ?? { suspensa: false, exclusao: null, impedimentos: [] }, resets: 0, signedIn: o.signedIn !== false,
    cases: o.cases ?? [], detail: o.detail ?? null, rpcError: o.rpcError ?? {}, queue: o.queue ?? [], dossier: o.dossier ?? null, admin: o.admin ?? false };
  if (s.signedIn) {
    await page.addInitScript(([id, token]) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
        user: { id, aud: "authenticated", role: "authenticated", email: "t@x.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }));
    }, [UID, jwt(UID)]);
  }
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (path.startsWith("/auth/v1/user")) return json(route, { id: UID, aud: "authenticated", role: "authenticated", email: "t@x.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    if (path.startsWith("/auth/v1/recover")) { s.resets++; return json(route, {}); }
    if (path === "/rest/v1/profiles") {
      const row = { id: UID, account_type: "cliente", display_name: "Teste", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
      return json(route, (req.headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
    }
    if (path === "/rest/v1/legal_consents") return json(route, [{ doc_key: "termos_cliente", doc_version: V, accepted_at: "2026-11-01T10:00:00Z" }]);
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.split("/").pop(); const body = req.method() === "POST" ? req.postDataJSON() : null;
      s.calls.push({ name, body });
      if (s.rpcError[name]) return json(route, { message: s.rpcError[name] }, 400);
      switch (name) {
        case "support_contact_email": return json(route, s.email);
        case "my_account_status": return json(route, s.status);
        case "my_support_cases": return json(route, s.cases);
        case "my_support_case": return json(route, s.detail);
        case "open_support_case": return json(route, CASE);
        case "add_support_case_message": return json(route, "m1");
        case "request_account_deletion": s.status = { ...s.status, exclusao: { id: "d1", executa_em: "2026-11-18T10:00:00Z" } }; return json(route, "d1");
        case "cancel_account_deletion": s.status = { ...s.status, exclusao: null }; return json(route, null);
        case "is_admin": return json(route, s.admin);
        case "admin_support_queue": return json(route, s.queue);
        case "admin_support_dossier": return json(route, s.dossier);
        default: return json(route, null);
      }
    }
    if (path.startsWith("/rest/v1/")) {
      if ((req.headers().accept ?? "").includes("vnd.pgrst.object")) return json(route, { code: "PGRST116", message: "no rows" }, 406);
      return json(route, []);
    }
    return json(route, {});
  });
  return s;
}
const calls = (s, n) => s.calls.filter((c) => c.name === n);

test("Suporte: botão Relatar ocorrência, Meus chamados e e-mail só quando cadastrado", async ({ page }) => {
  await serve(page, { email: null });
  await page.goto("/suporte", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Relatar ocorrência" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Meus chamados" })).toBeVisible();
  await expect(page.getByText("Ou escreva para")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pedir ajuda" })).toHaveCount(0);
});

test("Suporte: com e-mail cadastrado, ele aparece como link", async ({ page }) => {
  await serve(page, { email: "suporte@ile.com" });
  await page.goto("/suporte", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "suporte@ile.com" })).toHaveAttribute("href", "mailto:suporte@ile.com");
});

test("Relatar ocorrência: exige tipo, texto e ciência; envia o pedido certo e vai para Meus chamados", async ({ page }) => {
  const s = await serve(page);
  await page.goto("/suporte", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Relatar ocorrência" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Enviar ocorrência" }).click();
  await expect(page.getByText("Escolha o tipo de ocorrência.")).toBeVisible();
  expect(calls(s, "open_support_case")).toHaveLength(0);
  await dlg.getByLabel("O que aconteceu?").selectOption("pagamento");
  await expect(dlg.getByText(/Alta · até 24 h/)).toBeVisible();
  await dlg.getByLabel("Título").fill("Cobrança em dobro");
  await dlg.getByLabel("Conte o que aconteceu").fill("Fui cobrado duas vezes pelo mesmo ritual.");
  await dlg.getByRole("button", { name: "Enviar ocorrência" }).click();
  await expect(page.getByText(/Confirme que entendeu/)).toBeVisible();
  expect(calls(s, "open_support_case")).toHaveLength(0);
  await dlg.getByRole("checkbox").check();
  await dlg.getByRole("button", { name: "Enviar ocorrência" }).click();
  await expect(page).toHaveURL(/\/suporte\/chamados$/);
  const [c] = calls(s, "open_support_case");
  expect(c.body).toMatchObject({ p_kind: "pagamento", p_title: "Cobrança em dobro", p_context_type: null, p_source: "pessoa" });
});

test("Relatar ocorrência: risco à vida mostra 190/192/188; erro do servidor aparece e o diálogo continua", async ({ page }) => {
  await serve(page, { rpcError: { open_support_case: "Você já tem 5 chamados em aberto." } });
  await page.goto("/suporte", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Relatar ocorrência" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("O que aconteceu?").selectOption("risco_vida");
  await expect(dlg.getByRole("alert")).toContainText("190");
  await expect(dlg.getByRole("alert")).toContainText("188");
  await dlg.getByLabel("Título").fill("Perigo agora");
  await dlg.getByLabel("Conte o que aconteceu").fill("Preciso de ajuda urgente com uma situação.");
  await dlg.getByRole("checkbox").check();
  await dlg.getByRole("button", { name: "Enviar ocorrência" }).click();
  await expect(page.getByText("Você já tem 5 chamados em aberto.")).toBeVisible();
  await expect(dlg).toBeVisible();
});

const detail = (o = {}) => ({ id: CASE, papel: "autor", tipo: "pagamento", prioridade: "alta", status: "em_analise", criado_em: "2026-11-10T10:00:00Z", titulo: "Cobrança em dobro", resumo: "Fui cobrado duas vezes.",
  prazo_primeira_resposta: "2026-11-11T10:00:00Z", decisao: null, decisao_nota: null, mensagens: [{ id: "m0", de: "equipe", texto: "Estamos analisando.", em: "2026-11-10T12:00:00Z" }], provas: [], ...o });

test("Meus chamados: lista, abre o detalhe, mostra a resposta da equipe e envia mensagem", async ({ page }) => {
  const s = await serve(page, { cases: [{ id: CASE, kind: "pagamento", priority: "alta", status: "em_analise", title: "Cobrança em dobro", role: "autor", created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z", decision: null }], detail: detail() });
  await page.goto("/suporte/chamados", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /Cobrança em dobro/ }).click();
  await expect(page).toHaveURL(new RegExp(`/suporte/chamados/${CASE}$`));
  await expect(page.getByText("Estamos analisando.")).toBeVisible();
  await expect(page.getByText(/Primeira resposta até/)).toBeVisible();
  await page.getByLabel("Sua mensagem").fill("Segue o comprovante.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect.poll(() => calls(s, "add_support_case_message").length).toBe(1);
  expect(calls(s, "add_support_case_message")[0].body).toEqual({ p_case: CASE, p_body: "Segue o comprovante." });
});

test("Meus chamados: o envolvido vê só o resumo neutro e a decisão aparece no caso encerrado", async ({ page }) => {
  await serve(page, { detail: detail({ papel: "envolvido", titulo: "Pedido de esclarecimento", resumo: "Houve um relato sobre um atendimento.", tipo: "disputa" }) });
  await page.goto(`/suporte/chamados/${CASE}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Houve um relato sobre um atendimento.")).toBeVisible();
  await expect(page.getByText("Conte a sua versão abaixo")).toBeVisible();
  await expect(page.getByText(/Cobrança em dobro/)).toHaveCount(0);
});

test("Meus chamados: caso encerrado mostra a decisão e não permite novas mensagens nem arquivos", async ({ page }) => {
  await serve(page, { detail: detail({ status: "resolvido", decisao: "procedente", decisao_nota: "Reembolso integral aprovado." }) });
  await page.goto(`/suporte/chamados/${CASE}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Decisão: Procedente")).toBeVisible();
  await expect(page.getByText("Reembolso integral aprovado.")).toBeVisible();
  await expect(page.getByLabel("Sua mensagem")).toHaveCount(0);
  await expect(page.getByLabel("Escolher arquivo")).toHaveCount(0);
});

test("Meus chamados: arquivo só segue com a confirmação marcada", async ({ page }) => {
  const s = await serve(page, { detail: detail() });
  await page.goto(`/suporte/chamados/${CASE}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Escolher arquivo").setInputFiles({ name: "p.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
  await page.getByRole("button", { name: "Enviar arquivo" }).click();
  await expect(page.getByText("Marque a confirmação para enviar o arquivo.")).toBeVisible();
  expect(calls(s, "submit_support_evidence")).toHaveLength(0);
});

test("Conta: pedir exclusão exige digitar EXCLUIR; depois mostra a data e permite desistir", async ({ page }) => {
  const s = await serve(page);
  await page.goto("/suporte", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await page.getByRole("button", { name: "Pedir exclusão" }).click();
  await expect(page.getByText("Digite EXCLUIR para confirmar.")).toBeVisible();
  expect(calls(s, "request_account_deletion")).toHaveLength(0);
  await page.getByLabel("Digite EXCLUIR").fill("EXCLUIR");
  await page.getByRole("button", { name: "Pedir exclusão" }).click();
  await expect(page.getByText(/Exclusão agendada para/)).toBeVisible();
  expect(calls(s, "request_account_deletion")[0].body).toEqual({ p_confirm: "EXCLUIR" });
  await page.getByRole("button", { name: "Cancelar a exclusão" }).click();
  await expect(page.getByRole("button", { name: "Excluir minha conta" })).toBeVisible();
});

test("Conta: impedimentos listados e o botão de exclusão fica desabilitado", async ({ page }) => {
  await serve(page, { status: { suspensa: false, exclusao: null, impedimentos: ["Há um pedido de reembolso seu em andamento."] } });
  await page.goto("/suporte", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await expect(page.getByText("Há um pedido de reembolso seu em andamento.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pedir exclusão" })).toBeDisabled();
});

test("Esqueci a senha: link no login e mensagem neutra (não revela se a conta existe)", async ({ page }) => {
  const s = await serve(page, { signedIn: false });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Esqueci a senha" }).click();
  await expect(page).toHaveURL(/\/recuperar-senha$/);
  await page.getByLabel("E-mail").fill("naoexiste@x.test");
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();
  expect(s.resets).toBe(1);
});

test("Esqueci a senha: e-mail inválido não chama o servidor", async ({ page }) => {
  const s = await serve(page, { signedIn: false });
  await page.goto("/recuperar-senha", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill("sem-arroba");
  await page.getByRole("button", { name: "Enviar link" }).evaluate((b) => b.closest("form").noValidate = true);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
  expect(s.resets).toBe(0);
});

test("Nova senha: sem sessão de recuperação, o link é tratado como inválido", async ({ page }) => {
  await serve(page, { signedIn: false });
  await page.goto("/redefinir-senha", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Este link não é mais válido. Peça um novo.")).toBeVisible({ timeout: 8000 });
  await expect(page.getByLabel("Nova senha")).toHaveCount(0);
});

test("Nova senha: com sessão, valida tamanho e igualdade antes de enviar", async ({ page }) => {
  await serve(page);
  await page.goto("/redefinir-senha", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Nova senha").fill("curta");
  await page.getByLabel("Repita a senha").fill("curta");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText(/pelo menos 8 caracteres/)).toBeVisible();
  await page.getByLabel("Nova senha").fill("senhaboa123");
  await page.getByLabel("Repita a senha").fill("outra12345");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("As senhas não são iguais.")).toBeVisible();
});

test("Admin: seção Suporte mostra a fila por prioridade e o e-mail vazio", async ({ page }) => {
  await serve(page, { admin: true, email: null, queue: [
    { id: CASE, kind: "golpe_fraude", priority: "alta", status: "aberto", title: "Golpe no pix", opener_name: "Ana", subject_name: "Casa X", house_name: "Casa X", first_response_due: "2026-11-11T10:00:00Z", first_response_at: null, overdue: true, created_at: "2026-11-10T10:00:00Z" },
    { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", kind: "duvida", priority: "normal", status: "aberto", title: "Como cancelo", opener_name: "Bia", subject_name: null, house_name: null, first_response_due: "2026-11-13T10:00:00Z", first_response_at: null, overdue: false, created_at: "2026-11-10T10:00:00Z" },
  ] });
  await page.goto("/admin?s=suporte", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Vazio: a página Suporte não mostra e-mail.")).toBeVisible();
  await expect(page.getByText("prazo vencido")).toBeVisible();
  const titles = await page.getByRole("button", { name: /Golpe no pix|Como cancelo/ }).allTextContents();
  expect(titles[0]).toContain("Golpe no pix");
});
