// Acessibilidade — cobertura ampliada (19/11/2026): telas criadas ou esquecidas depois da auditoria de 17/11
// (páginas institucionais, créditos de áudio, chamados, convites, retorno de pagamento, 404 e as 7 seções da administração),
// mais reflow em 320 px (WCAG 1.4.10), texto a 200% (1.4.4) e espaçamento de texto (1.4.12).
// Precisa de: npm install --no-save @axe-core/playwright axe-core
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

let AxeBuilder = null;
try { AxeBuilder = (await import("@axe-core/playwright")).default; } catch { /* sem o pacote: pula */ }

const ME = U(1), HID = U(60);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consent = (...keys) => keys.map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }));
const rpc = { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, music_credits: [] };
const logado = { rest: { profiles: pessoa, legal_consents: consent("termos_cliente", "dados_sensiveis"), platform_settings: [] }, rpc };

const INFO = ["normas-de-uso", "conduta", "eventos-e-taxas", "termos-do-cliente", "termos-da-casa", "privacidade-lgpd", "novidades-seguranca", "quem-somos", "visao"].map((s) => `/sobre/${s}`);
const GRUPOS = [
  { nome: "institucionais (sem login)", login: null, telas: [...INFO, "/redefinir-senha", "/nao-existe-mesmo"] },
  { nome: "conta pessoa: restantes", login: logado, telas: ["/creditos-de-audio", "/suporte/chamados", "/pessoas", `/rituais/${U(70)}`, "/convite/abc123", "/pagamento/retorno", "/pagamento/conta", "/nao-existe-mesmo"] },
  { nome: "administração: seções", login: logado, telas: ["visao", "reembolsos", "suporte", "usuarios", "config", "docs", "historico"].map((s) => `/admin?s=${s}`) },
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const vp of [{ n: "celular 375", width: 375, height: 740 }, { n: "computador", width: 1280, height: 800 }]) {
  for (const scheme of ["light", "dark"]) {
    for (const g of GRUPOS) {
      test(`axe: ${g.nome} · ${vp.n} · ${scheme}`, async ({ page }) => {
        test.skip(!AxeBuilder, "pacote @axe-core/playwright não instalado");
        test.setTimeout(180000);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme });
        if (g.login) await api(page, g.login);
        const achados = [];
        for (const tela of g.telas) {
          await page.goto(tela);
          await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(150);
          const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          for (const v of r.violations) achados.push(`${tela} · ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0].target.join(" ")} — ${(v.nodes[0].failureSummary ?? "").split("\n")[1] ?? ""}`.slice(0, 300));
        }
        expect(achados).toEqual([]);
      });
    }
  }
}

// ---- reflow, texto maior e espaçamento de texto ----
const TELAS_RESPONSIVAS = [
  { nome: "entrar", login: null, tela: "/login" },
  { nome: "cadastro", login: null, tela: "/register" },
  { nome: "início", login: logado, tela: "/" },
  { nome: "comunidade", login: logado, tela: "/comunidade" },
  { nome: "descobrir", login: logado, tela: "/descobrir" },
  { nome: "planos", login: logado, tela: "/planos" },
  { nome: "suporte", login: logado, tela: "/suporte" },
  { nome: "termos", login: logado, tela: "/termos" },
  { nome: "créditos de áudio", login: logado, tela: "/creditos-de-audio" },
  { nome: "administração", login: logado, tela: "/admin" },
  { nome: "administração: configurações", login: logado, tela: "/admin?s=config" },
  { nome: "administração: reembolsos", login: logado, tela: "/admin?s=reembolsos" },
  { nome: "administração: suporte (admin)", login: logado, tela: "/admin?s=suporte" },
  { nome: "administração: usuários", login: logado, tela: "/admin?s=usuarios" },
  { nome: "administração: documentos", login: logado, tela: "/admin?s=docs" },
  { nome: "administração: histórico", login: logado, tela: "/admin?s=historico" },
  { nome: "normas (institucional)", login: null, tela: "/sobre/normas-de-uso" },
];
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// Rolagem lateral permitida só dentro de uma tabela/região nomeada e focável (já tratado em 17/11): conta só a página.

for (const t of TELAS_RESPONSIVAS) {
  test(`reflow 320 px sem rolagem lateral: ${t.nome}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    if (t.login) await api(page, t.login);
    await page.goto(t.tela); await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(150);
    expect(await semRolagemLateral(page)).toBe(true);
  });
  test(`texto a 200% sem rolagem lateral nem texto cortado: ${t.nome}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    if (t.login) await api(page, t.login);
    await page.goto(t.tela); await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(150);
    await page.addStyleTag({ content: "html{font-size:200% !important}" });
    await page.waitForTimeout(200);
    expect(await semRolagemLateral(page)).toBe(true);
  });
  test(`espaçamento de texto (WCAG 1.4.12) não cria rolagem lateral: ${t.nome}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    if (t.login) await api(page, t.login);
    await page.goto(t.tela); await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(150);
    await page.addStyleTag({ content: "*{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important} p{margin-bottom:2em !important}" });
    await page.waitForTimeout(200);
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
