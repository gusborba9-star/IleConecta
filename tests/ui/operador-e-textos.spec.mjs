// Identificação do operador (Termos e Política) e textos novos do parecer de 20/11/2026. API simulada; nada sai para a internet.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";
import { LEGAL_VERSION } from "../../src/lib/legalCore.js";

let AxeBuilder = null;
try { AxeBuilder = (await import("@axe-core/playwright")).default; } catch { /* sem o pacote: pula a parte de axe */ }

const ME = U(1);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = ["termos_cliente", "dados_sensiveis"].map((k) => ({ doc_key: k, doc_version: LEGAL_VERSION, accepted_at: "2026-11-01T10:00:00Z" }));
const OP = { name: "Gustavo dos Santos Borba", document: "***.116.210-**", address: null, email: null };
const SENT = "A plataforma Ilê Conecta é operada e administrada por Gustavo dos Santos Borba, inscrito(a) no CPF sob o nº ***.116.210-**, com canal de atendimento eletrônico pelo suporte interno do aplicativo.";
const adminRpc = { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, operator_identity_public: OP, admin_operator_log: [] };

test("as 4 páginas legais mostram quem opera a plataforma; as outras, não", async ({ page }) => {
  await api(page, { rpc: { operator_identity_public: OP } });
  for (const slug of ["normas-de-uso", "termos-do-cliente", "termos-da-casa", "privacidade-lgpd"]) {
    await page.goto(`/sobre/${slug}`);
    await expect(page.getByTestId("operator-notice")).toHaveText(SENT);
  }
  for (const slug of ["conduta", "quem-somos", "eventos-e-taxas"]) {
    await page.goto(`/sobre/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("operator-notice")).toHaveCount(0);
  }
});

test("a identificação não vai para o rodapé, o início nem a tela de planos", async ({ page }) => {
  await api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: { operator_identity_public: OP } });
  for (const rota of ["/", "/planos", "/termos"]) {
    await page.goto(rota);
    await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {});
    await expect(page.getByText("***.116.210-**")).toHaveCount(0);
  }
});

test("falha ao ler a identificação: a página abre normalmente, sem a frase (falha segura)", async ({ page }) => {
  await api(page, { rpc: { operator_identity_public: { status: 500, body: { message: "boom" } } } });
  await page.goto("/sobre/privacidade-lgpd");
  await expect(page.getByRole("heading", { level: 1, name: "Privacidade e LGPD" })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("operator-notice")).toHaveCount(0);
});

test("dado com HTML ou CPF completo não é exibido (defesa em profundidade)", async ({ page }) => {
  await api(page, { rpc: { operator_identity_public: { ...OP, document: "123.116.210-45" } } });
  await page.goto("/sobre/privacidade-lgpd");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("operator-notice")).toHaveCount(0);
  await expect(page.getByText("123.116.210-45")).toHaveCount(0);
  const p2 = await page.context().newPage();
  await api(p2, { rpc: { operator_identity_public: { ...OP, name: "Fulano <img src=x onerror=window.__xss=1>" } } });
  await p2.goto("/sobre/termos-da-casa");
  await p2.waitForTimeout(500);
  expect(await p2.evaluate(() => window.__xss)).toBeUndefined();
});

test("e-mail e endereço entram na frase quando existirem", async ({ page }) => {
  await api(page, { rpc: { operator_identity_public: { ...OP, address: "Caixa postal 12, Salvador/BA", email: "contato@ileconecta.com.br" } } });
  await page.goto("/sobre/termos-do-cliente");
  await expect(page.getByTestId("operator-notice")).toContainText("com endereço em Caixa postal 12, Salvador/BA, com canal de atendimento eletrônico pelo e-mail contato@ileconecta.com.br ou pelo suporte interno do aplicativo.");
});

test("Política: transferência internacional, registro técnico e Momentos, com os prazos do parecer", async ({ page }) => {
  await api(page, { rpc: { operator_identity_public: OP } });
  await page.goto("/sobre/privacidade-lgpd");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "Transferência internacional de dados" })).toBeVisible();
  await expect(main.getByText("art. 33, IX, combinado com o art. 7º, V")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Registros técnicos e diagnóstico de erros" })).toBeVisible();
  await expect(main.getByText("por até 30 (trinta) dias. Esses registros não carregam endereço IP, e-mail ou identificador da conta")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Momentos (publicações de 24 horas)" })).toBeVisible();
  await expect(main.getByText("eliminados definitivamente dos servidores em até 48 (quarenta e oito) horas após a publicação")).toBeVisible();
  await expect(main.getByText("até 90 (noventa) dias após a conclusão da análise")).toBeVisible();
  const texto = (await main.innerText()).toLowerCase();
  const trecho = texto.slice(texto.indexOf("transferência internacional de dados"), texto.indexOf("registros técnicos e diagnóstico"));
  expect(trecho).not.toContain("legítimo interesse");
  expect(trecho).not.toContain("assinaram");
  await noHScroll(page);
});

test("Termos da Casa: imagem de terceiros e de crianças e adolescentes", async ({ page }) => {
  await api(page, { rpc: { operator_identity_public: OP } });
  await page.goto("/sobre/termos-da-casa");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "Imagem de terceiros e de crianças e adolescentes" })).toBeVisible();
  await expect(main.getByText("A casa declara possuir autorização de uso de imagem")).toBeVisible();
  await expect(main.getByText("consentimento específico e destacado dos pais ou responsáveis legais")).toBeVisible();
  await expect(main.getByText("ocultar ou remover imediatamente")).toBeVisible();
});

test("card do dono: CPF completo é recusado na tela, sem chamar o banco", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: adminRpc });
  await page.goto("/admin?s=config");
  await expect(page.getByRole("heading", { name: "Identificação do operador" })).toBeVisible();
  await expect(page.getByLabel("Nome completo ou razão social")).toHaveValue("Gustavo dos Santos Borba");
  await expect(page.getByRole("button", { name: "Salvar identificação" })).toBeDisabled();
  await page.getByLabel("CPF mascarado ou CNPJ completo").fill("123.116.210-45");
  await expect(page.getByRole("alert")).toContainText("O CPF completo não pode ser publicado");
  await expect(page.getByRole("button", { name: "Salvar identificação" })).toBeDisabled();
  expect(calls.filter((x) => x.name === "admin_operator_set").length).toBe(0);
});

test("card do dono: troca para CNPJ pede confirmação, grava os campos certos e avisa", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: { ...adminRpc, admin_operator_set: { ok: true, notified: 7 } } });
  await page.goto("/admin?s=config");
  await page.getByLabel("Nome completo ou razão social").fill("Ilê Conecta Ltda");
  await page.getByLabel("CPF mascarado ou CNPJ completo").fill("12.345.678/0001-95");
  await page.getByLabel("E-mail de atendimento (opcional)").fill("contato@ileconecta.com.br");
  await expect(page.getByLabel("Como vai aparecer")).toContainText("inscrita no CNPJ sob o nº 12.345.678/0001-95");
  await page.getByRole("button", { name: "Salvar identificação" }).click();
  await expect(page.getByRole("dialog")).toContainText("todas as contas recebem um aviso");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Salvo. 7 conta(s) avisada(s).")).toBeVisible();
  expect(calls.find((x) => x.name === "admin_operator_set").body).toEqual({ p_name: "Ilê Conecta Ltda", p_document: "12.345.678/0001-95", p_address: null, p_email: "contato@ileconecta.com.br", p_notify: true });
});

test("card do dono: sem avisar, e cancelar a confirmação não grava nada", async ({ page }) => {
  const calls = await api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: { ...adminRpc, admin_operator_set: { ok: true, notified: 0 } } });
  await page.goto("/admin?s=config");
  await page.getByLabel("Endereço ou caixa postal (opcional)").fill("Caixa postal 12, Salvador/BA");
  await page.getByRole("button", { name: "Salvar identificação" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click();
  expect(calls.filter((x) => x.name === "admin_operator_set").length).toBe(0);
  await page.getByRole("checkbox", { name: /Avisar todas as contas/ }).uncheck();
  await page.getByRole("button", { name: "Salvar identificação" }).click();
  await expect(page.getByRole("dialog")).toContainText("Ninguém será avisado");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Salvo. Ninguém foi avisado.")).toBeVisible();
  expect(calls.find((x) => x.name === "admin_operator_set").body.p_notify).toBe(false);
});

test("card do dono: mostra o erro do banco e o histórico sem interpretar HTML; quem não é dono não vê o card", async ({ page }) => {
  const log = [{ at: "2026-11-20T15:00:00Z", by: "Dono <b>x</b>", name: "Gustavo dos Santos Borba", document: "***.116.210-**", address: null, email: null }];
  await api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: { ...adminRpc, admin_operator_log: log, admin_operator_set: { status: 400, body: { message: "Nada mudou." } } } });
  await page.goto("/admin?s=config");
  await page.getByText(/Histórico de mudanças \(1\)/).click();
  await expect(page.getByText("Dono <b>x</b>: Gustavo dos Santos Borba", { exact: false })).toBeVisible();
  await page.getByLabel("E-mail de atendimento (opcional)").fill("a@ileconecta.com.br");
  await page.getByRole("button", { name: "Salvar identificação" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Nada mudou.")).toBeVisible();
  const p2 = await page.context().newPage();
  await api(p2, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: { ...adminRpc, admin_my_access: { admin: true, owner: false, perms: ["suporte"] } } });
  await p2.goto("/admin?s=config");
  await p2.waitForTimeout(600);
  await expect(p2.getByRole("heading", { name: "Identificação do operador" })).toHaveCount(0);
});

for (const scheme of ["light", "dark"]) {
  test(`acessibilidade (axe) e 320 px: card e páginas legais · ${scheme}`, async ({ page }) => {
    test.skip(!AxeBuilder, "pacote @axe-core/playwright não instalado");
    test.setTimeout(120000);
    await page.emulateMedia({ colorScheme: scheme });
    await api(page, { rest: { profiles: pessoa, legal_consents: consents, platform_settings: [] }, rpc: { ...adminRpc, admin_operator_log: [{ at: "2026-11-20T15:00:00Z", by: "Dono", name: "Gustavo dos Santos Borba", document: "***.116.210-**", address: null, email: null }] } });
    for (const vp of [{ width: 320, height: 640 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      for (const rota of ["/admin?s=config", "/sobre/privacidade-lgpd", "/sobre/termos-da-casa"]) {
        await page.goto(rota);
        await page.locator("h1").first().waitFor({ timeout: 5000 });
        await page.waitForTimeout(300);
        if (rota.includes("config")) await page.getByText(/Histórico de mudanças/).click();
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
        expect(r.violations.map((v) => `${rota} ${v.id}: ${v.nodes[0].target.join(" ")}`)).toEqual([]);
        await noHScroll(page);
      }
    }
  });
}
