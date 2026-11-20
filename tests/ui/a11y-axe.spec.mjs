// Acessibilidade automática (axe-core, WCAG 2.2 AA + boas práticas) nas telas principais: celular e computador, tema claro e escuro.
// Qualquer problema novo falha aqui. Precisa de: npm install --no-save @axe-core/playwright axe-core
import { test, expect } from "@playwright/test";
import { api, U } from "./_api.mjs";

let AxeBuilder = null;
try { AxeBuilder = (await import("@axe-core/playwright")).default; } catch { /* sem o pacote: pula */ }

const ME = U(1), HID = U(60);
const pessoa = { id: ME, account_type: "pessoa", display_name: "Admin", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const casa = { ...pessoa, account_type: "casa", display_name: "Casa Axé" };
const consent = (...keys) => keys.map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-9", accepted_at: "2026-11-01T10:00:00Z" }));
const house = { id: HID, owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
const rpc = { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] } };

const GRUPOS = [
  { nome: "sem login", login: null, telas: ["/login", "/register", "/recuperar-senha"] },
  { nome: "pessoa/administração", login: { rest: { profiles: pessoa, legal_consents: consent("termos_cliente", "dados_sensiveis") }, rpc },
    telas: ["/", "/comunidade", "/descobrir", "/rituais", "/perfil", "/mensagens", "/planos", "/suporte", "/termos", "/atividade", "/destaques", "/admin"] },
  { nome: "casa", login: { rest: { profiles: casa, legal_consents: consent("termos_casa"), houses: [house] }, rpc: {} },
    telas: ["/", `/casa/${HID}`, "/planos", "/atendimento", "/mensalidades", "/divulgacao", "/equipe", "/impulsionar", "/destaques", "/painel/membros", "/moderacao", "/mensagens"] },
];

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
          await page.waitForTimeout(700);
          const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
          for (const v of r.violations) achados.push(`${tela} · ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0].target.join(" ")} — ${(v.nodes[0].failureSummary ?? "").split("\n")[1] ?? ""}`.slice(0, 300));
        }
        expect(achados).toEqual([]);
      });
    }
  }
}
