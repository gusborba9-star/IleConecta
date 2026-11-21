// Telas das etapas 0123–0126 (CPF/CNPJ, vaga extra, cobrança) em navegador real, com a API simulada. Nada sai para a internet.
import { test, expect } from "@playwright/test";

const SESSION = { access_token: "aaa.bbb.ccc", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email: "casa@teste.app" } };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

/** API simulada: `rpc[name]` devolve o corpo (ou {status, body}); registra as chamadas. */
async function api(page, { rpc = {}, rest = {}, fn = {} } = {}) {
  const calls = [];
  await page.addInitScript((s) => { try { localStorage.setItem("sb-sb-auth-token", JSON.stringify(s)); } catch { /* sem storage */ } }, SESSION);
  await page.route("http://sb.test/**", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    let body = null; try { body = req.postDataJSON(); } catch { /* sem corpo */ }
    const send = (v) => { const o = typeof v === "function" ? v(body, calls) : v; const r = o && typeof o === "object" && "status" in o && "body" in o ? o : { status: 200, body: o }; return route.fulfill({ status: r.status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(r.body) }); };
    const m = url.pathname.match(/\/rest\/v1\/rpc\/(.+)$/);
    if (m) { calls.push({ kind: "rpc", name: m[1], body }); return send(rpc[m[1]] ?? null); }
    const t = url.pathname.match(/\/rest\/v1\/(.+)$/);
    if (t) { calls.push({ kind: "rest", name: t[1], body }); const v = rest[t[1]] ?? []; return send(req.headers()["accept"]?.includes("vnd.pgrst.object") ? (Array.isArray(v) ? v[0] ?? null : v) : v); }
    const f = url.pathname.match(/\/functions\/v1\/(.+)$/);
    if (f) { calls.push({ kind: "fn", name: f[1], body }); return send(fn[f[1]] ?? {}); }
    return route.fulfill({ status: 404, headers: CORS, body: "{}" });
  });
  return calls;
}
const noHScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
const CPF = "529.982.247-25";
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

for (const vp of [{ name: "celular 375", width: 375, height: 740 }, { name: "desktop", width: 1280, height: 800 }]) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Vaga extra: pedir o reembolso de 7 dias da primeira contratação (confirma, chama o servidor uma vez, mostra o resultado)", async ({ page }) => {
      const ID = "11111111-1111-1111-1111-111111111111";
      let items = [{ charge_id: ID, amount_cents: 3990, deadline: new Date(Date.now() + 3 * 86400000).toISOString() }];
      const calls = await api(page, {
        rpc: { my_credit_refunds: { items: [], history: [], window_days: 7 }, my_seat_refunds: () => ({ has_house: true, window_days: 7, items, history: items.length ? [] : [{ amount_cents: 3990, status: "pendente", at: "2026-11-16T10:00:00Z" }] }) },
        fn: { "platform-billing": () => { items = []; return { status: "done", amount_cents: 3990 }; } },
      });
      const dialogs = [];
      page.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });
      await page.goto("/tests/browser/ui-harness.html?c=orders");
      await page.getByText("Pedidos e validações").click();
      await page.getByText("Vaga extra de equipe: primeira contratação").click();
      await expect(page.getByText(/devolvemos R\$ 39,90 \(valor integral\) e a vaga é retirada/)).toBeVisible();
      await expect(page.getByText(/renovações mensais da vaga não têm reembolso/)).toBeVisible();
      await noHScroll(page);
      await page.getByRole("button", { name: "Cancelar vaga e solicitar reembolso" }).dblclick();
      await expect(page.getByText(/Pedido aprovado/)).toBeVisible();
      expect(dialogs).toHaveLength(1);
      expect(dialogs[0]).toMatch(/R\$ 39,90/);
      const fnCalls = calls.filter((c) => c.kind === "fn");
      expect(fnCalls).toHaveLength(1);
      expect(fnCalls[0].body).toEqual({ action: "seat_refund", charge_id: ID });
      await expect(page.getByRole("button", { name: "Cancelar vaga e solicitar reembolso" })).toHaveCount(0);
      await expect(page.getByText("Reembolso da vaga extra de R$ 39,90: a caminho")).toBeVisible();
    });

    test("Vaga extra: recusa do servidor aparece em português, sem detalhe técnico; dados hostis não quebram a tela", async ({ page }) => {
      const ID = "22222222-2222-2222-2222-222222222222";
      await api(page, {
        rpc: { my_credit_refunds: { items: [], history: [], window_days: 7 }, my_seat_refunds: { has_house: true, window_days: 7, items: [{ charge_id: ID, amount_cents: 3990, deadline: "2099-01-01T00:00:00Z" }, { charge_id: "<script>x</script>", amount_cents: 100 }, { charge_id: ID, amount_cents: -5 }], history: [] } },
        fn: { "platform-billing": { status: 409, body: { error: "Há mais pessoas na equipe do que vagas. Remova 1 pessoa(s) da equipe antes de pedir o reembolso." } } },
      });
      page.on("dialog", (d) => d.accept());
      await page.goto("/tests/browser/ui-harness.html?c=orders");
      await page.getByText("Pedidos e validações").click();
      await expect(page.getByText("Vaga extra de equipe: primeira contratação")).toHaveCount(1);
      await page.getByText("Vaga extra de equipe: primeira contratação").click();
      await page.getByRole("button", { name: "Cancelar vaga e solicitar reembolso" }).click();
      await expect(page.getByText(/Remova 1 pessoa\(s\) da equipe antes de pedir o reembolso/)).toBeVisible();
      await noHScroll(page);
    });

    test("Central de pendências: vencidos primeiro, filtros, dados hostis sem quebrar e atalho para onde resolver", async ({ page }) => {
      const it = (o) => ({ kind: "suporte", ref_id: "r1", house_id: "h1", house_name: "Casa Um", title: "Cobrança em duplicidade", detail: "pagamento", priority: "alta", due_at: new Date(Date.now() - 5 * 3600000).toISOString(), overdue: true, since: new Date(Date.now() - 30 * 3600000).toISOString(), tab: "suporte", ...o });
      const items = [
        it({}),
        it({ ref_id: "r2", kind: "moderacao", title: "<img src=x onerror=window.__xss=1>", priority: "normal", overdue: false, due_at: new Date(Date.now() + 2 * 86400000).toISOString(), tab: "moderacao", house_name: null }),
        it({ ref_id: "r3", kind: "reembolso_plataforma", title: "Reembolso de plano de 89,90", detail: "falhou", overdue: false, due_at: null, tab: "cobranca" }),
        { kind: "inventado", ref_id: "x" }, null,
      ];
      await api(page, { rpc: { admin_pending_center: { generated_at: new Date().toISOString(), total: 12, overdue: 1, counts: { suporte: 1, moderacao: 1, reembolso_plataforma: 1 }, items } } });
      await page.goto("/tests/browser/ui-harness.html?c=pending");
      await expect(page.getByRole("heading", { name: "Central de pendências" })).toBeVisible();
      await expect(page.getByText("1 vencida")).toBeVisible();
      await expect(page.getByText(/de 12 pendências/)).toBeVisible();
      await expect(page.getByText(/mostrando as 3 mais urgentes/)).toBeVisible();
      const rows = page.locator("li");
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText("Chamado de suporte");
      await expect(rows.first()).toContainText(/venceu há 5 h/);
      await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      await expect(rows.nth(2)).toContainText("sem prazo");
      await noHScroll(page);
      await page.getByLabel("Só vencidas").check();
      await expect(rows).toHaveCount(1);
      await page.getByLabel("Só vencidas").uncheck();
      await page.getByLabel("Filtrar por tipo").selectOption("moderacao");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("Moderação");
      await page.getByRole("button", { name: /Resolver em Configurações › Moderação/ }).click();
      await expect(page).toHaveURL(/[?&]s=config/);
    });

    test("Central de pendências: vazia, com erro do servidor e sem detalhe técnico", async ({ page }) => {
      await api(page, { rpc: { admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] } } });
      await page.goto("/tests/browser/ui-harness.html?c=pending");
      await expect(page.getByText("Nada pendente agora.")).toBeVisible();
      await noHScroll(page);
      const p2 = await page.context().newPage();
      await api(p2, { rpc: { admin_pending_center: { status: 403, body: { message: "Área restrita à administração." } } } });
      await p2.goto("/tests/browser/ui-harness.html?c=pending");
      await expect(p2.getByRole("alert")).toContainText("Área restrita");
      await expect(p2.getByRole("alert")).not.toContainText(/pg_|sqlstate|stack/i);
    });

    test("Central da casa: pendências, a pagar com desconto do Pix, dados hostis sem quebrar e atalho para onde resolver", async ({ page }) => {
      const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
      const it = (o) => ({ kind: "conversa_sem_resposta", ref_id: U(1), title: "Conversa com Ana", detail: "sem_resposta", priority: "normal", due_at: new Date(Date.now() - 6 * 3600000).toISOString(), overdue: true, since: new Date(Date.now() - 30 * 3600000).toISOString(), tab: "atendimento", ...o });
      const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const items = [it({}), it({ ref_id: U(2), kind: "assunto_da_assistente", title: "<img src=x onerror=window.__xss=1>", priority: "alta", overdue: false, due_at: new Date(Date.now() + 3 * 3600000).toISOString() }), it({ ref_id: U(3), kind: "mensalidade_vencida", title: "Mensalidade de Bia — R$ 50,00", overdue: false, due_at: null, tab: "mensalidades" }), { kind: "inventado", ref_id: U(4) }, null];
      await api(page, { rpc: { house_pending_center: { house_id: U(9), house_name: "Casa Um", role: "titular", total: 9, overdue: 1, counts: { conversa_sem_resposta: 1, assunto_da_assistente: 1, mensalidade_vencida: 1 }, items,
        to_pay: { total_cents: 59980, count: 2, charges: [{ id: U(5), kind: "plan", description: "Plano", amount_cents: 29990, due_date: day(-3), status: "vencida", pix_discount_cents: 0, overdue: true }, { id: U(6), kind: "plan", description: "Plano", amount_cents: 29990, due_date: day(10), status: "aberta", pix_discount_cents: 1500, overdue: false }] } } } });
      await page.goto("/tests/browser/ui-harness.html?c=housepending");
      await expect(page.getByRole("heading", { name: "Central de pendências" })).toBeVisible();
      await expect(page.getByText("1 vencida")).toBeVisible();
      await expect(page.getByText(/mostrando as 3 mais urgentes/)).toBeVisible();
      const rows = page.locator("li").filter({ hasText: /Conversa com Ana|Assunto passado|Mensalidade de Bia/ });
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText("Conversa sem resposta");
      await expect(page.getByText(/venceu há 6 h/)).toBeVisible();
      await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      const pay = page.getByRole("region", { name: "A pagar à plataforma" });
      await expect(pay).toBeVisible();
      await expect(pay).toContainText("R$ 599,80");
      await expect(pay).toContainText("(vencida)");
      await expect(pay).toContainText(/no Pix: R\$\s284,90/);
      await noHScroll(page);
      await page.getByLabel("Só vencidas").check();
      await expect(page.getByText("Mensalidade de Bia")).toHaveCount(0);
      await page.getByLabel("Só vencidas").uncheck();
      await page.getByLabel("Filtrar por tipo").selectOption("mensalidade_vencida");
      await expect(page.getByText("Mensalidade de Bia")).toBeVisible();
      await page.getByRole("button", { name: /Abrir Membros/ }).click();
      await expect(page).toHaveURL(/\/painel\/membros/);
    });

    test("Central da casa: equipe não vê 'a pagar'; vazia; quem não é da casa não vê o cartão; erro do servidor sem detalhe técnico", async ({ page }) => {
      await api(page, { rpc: { house_pending_center: { house_id: "00000000-0000-0000-0000-000000000009", house_name: "Casa Um", role: "equipe", total: 0, overdue: 0, counts: {}, items: [], to_pay: null } } });
      await page.goto("/tests/browser/ui-harness.html?c=housepending");
      await expect(page.getByText("O que espera a casa e que você pode acompanhar.")).toBeVisible();
      await expect(page.getByText("Nada pendente agora.")).toBeVisible();
      await expect(page.getByRole("region", { name: "A pagar à plataforma" })).toHaveCount(0);
      await noHScroll(page);
      const p2 = await page.context().newPage();
      await api(p2, { rpc: { house_pending_center: { status: 403, body: { message: "not_house" } } } });
      await p2.goto("/tests/browser/ui-harness.html?c=housepending");
      await p2.waitForTimeout(800);
      await expect(p2.getByRole("heading", { name: "Central de pendências" })).toHaveCount(0);
      const p3 = await page.context().newPage();
      await api(p3, { rpc: { house_pending_center: { status: 500, body: { message: "Não foi possível carregar as pendências." } } } });
      await p3.goto("/tests/browser/ui-harness.html?c=housepending");
      await expect(p3.getByRole("alert")).toContainText("Não foi possível carregar");
      await expect(p3.getByRole("alert")).not.toContainText(/pg_|sqlstate|stack/i);
    });

    test("Pessoas da casa: segmentos, busca, história da pessoa; texto hostil não vira código", async ({ page }) => {
      const P = (n, o = {}) => ({ person_id: U(n), name: `Pessoa ${n}`, avatar_url: null, city: "Salvador", state: "BA", segments: ["cliente"], purchases: 1, spent_cents: 5000, first_at: "2026-10-01T10:00:00Z", last_at: new Date(Date.now() - 2 * 86400000).toISOString(), ...o });
      const counts = { todos: 3, seguidor: 1, conversou: 0, interessado: 0, cliente: 2, recorrente: 0, participante: 0, membro: 0, pendencia: 1, sumido: 0 };
      const calls = await api(page, { rpc: {
        house_people: (b) => ({ role: "titular", segment: b.p_segment, total: b.p_segment === "cliente" ? 2 : 3, counts, items: b.p_search ? [P(7, { name: "Ana Souza" })] : [P(1, { name: "<img src=x onerror=window.__xss=1>", segments: ["cliente", "pendencia"], spent_cents: 12345 }), P(2, { segments: ["seguidor"], purchases: 0, spent_cents: 0 }), P(3, { segments: ["cliente"] })].slice(0, b.p_segment === "cliente" ? 2 : 3) }),
        house_person_timeline: () => ({ role: "titular", person: P(1), events: [{ at: new Date(Date.now() - 86400000).toISOString(), kind: "pedido", ref_id: U(30), title: "Trabalho de limpeza", detail: "confirmado" }, { at: "2026-10-01T10:00:00Z", kind: "seguiu", ref_id: U(9), title: "Passou a seguir a casa", detail: null }] }),
      } });
      await page.goto("/tests/browser/ui-harness.html?c=people");
      await expect(page.getByRole("heading", { name: "Pessoas da casa" })).toBeVisible();
      const rows = page.locator("li").filter({ hasText: /Última atividade/ });
      await expect(rows).toHaveCount(3);
      await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      await expect(rows.first()).toContainText(/R\$\s123,45/);
      await expect(page.getByRole("tab", { name: /Conversaram/ })).toHaveCount(0); // segmento vazio não aparece
      await noHScroll(page);
      await page.getByRole("tab", { name: /Clientes \(2\)/ }).click();
      await expect(rows).toHaveCount(2);
      await page.getByRole("tab", { name: /^Todas/ }).click();
      await rows.first().getByRole("button").first().click();
      await expect(page.getByRole("list", { name: "Linha do tempo" })).toBeVisible();
      await expect(page.getByText("Trabalho de limpeza")).toBeVisible();
      await expect(page.getByText(/pago, esperando início/)).toBeVisible();
      await expect(page.getByText("ontem").first()).toBeVisible();
      await noHScroll(page);
      await page.getByLabel("Buscar pessoa pelo nome").fill("ana");
      await expect(page.getByText("Ana Souza")).toBeVisible();
      await expect(rows).toHaveCount(1);
      expect(calls.filter((c) => c.name === "house_people").some((c) => c.body.p_search === "ana")).toBe(true);
      expect(calls.filter((c) => c.name === "house_person_timeline")[0].body.p_person).toBe(U(1));
    });

    test("Pessoas da casa: equipe não vê valores; sem permissão e erro do servidor aparecem em português, sem detalhe técnico", async ({ page }) => {
      await api(page, { rpc: { house_people: { role: "equipe", segment: "todos", total: 1, counts: { todos: 1, cliente: 1 }, items: [{ person_id: U(1), name: "Bia", avatar_url: null, city: null, state: null, segments: ["cliente"], purchases: 3, spent_cents: null, first_at: null, last_at: null }] } } });
      await page.goto("/tests/browser/ui-harness.html?c=people");
      await expect(page.getByText("Bia")).toBeVisible();
      await expect(page.getByText("3 compras")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("R$");
      const p2 = await page.context().newPage();
      await api(p2, { rpc: { house_people: { status: 403, body: { message: "sem_permissao" } } } });
      await p2.goto("/tests/browser/ui-harness.html?c=people");
      await expect(p2.getByRole("alert")).toContainText("Você não tem permissão");
      const p3 = await page.context().newPage();
      await api(p3, { rpc: { house_people: { status: 500, body: { message: "relation pg_x failed sqlstate 42P01" } } } });
      await p3.goto("/tests/browser/ui-harness.html?c=people");
      await expect(p3.getByRole("alert")).toContainText("Não foi possível carregar as pessoas.");
      await expect(p3.getByRole("alert")).not.toContainText(/pg_|sqlstate/i);
    });

    test("Indicadores da casa: números com variação, período e 'como é calculado'", async ({ page }) => {
      const P = (current, previous = 0) => ({ current, previous });
      const body = (days, role = "titular") => ({ days, role, metrics: {
        novos_seguidores: P(3, 2), pessoas_que_falaram: P(4, 1), tempo_resposta_min: P(90, 30), pedidos_criados: P(7, 2), pedidos_pagos: P(3, 2), pedidos_perdidos: P(2, 0),
        reservas_confirmadas: P(4, 1), reservas_canceladas: P(1, 0), clientes_no_periodo: P(5, 2), clientes_que_voltaram: P(1, 0),
        volume_cents: P(27000, 13000), reembolsos: P(1, 0), avaliacoes: P(2, 1), nota_media: P(4.5, 3) },
        snapshot: { seguidores_total: 6, ocupacao_pct: 20, avaliacoes_sem_resposta: 2 } });
      const calls = await api(page, { rpc: { house_indicators: (b) => body(b.p_days) } });
      await page.goto("/tests/browser/ui-harness.html?c=indicators");
      await expect(page.getByRole("heading", { name: "Indicadores da casa" })).toBeVisible();
      const tile = (name) => page.locator("li").filter({ hasText: name });
      await expect(tile("Pedidos criados")).toContainText("7");
      await expect(tile("Pedidos criados")).toContainText("+250% sobre o período anterior");
      await expect(tile("Tempo de resposta")).toContainText("1,5 h");
      await expect(tile("Tempo de resposta")).toContainText("+200% sobre o período anterior");
      await expect(tile("Conversão dos pedidos")).toContainText("42,9%");
      await expect(tile("Valor vendido")).toContainText(/R\$\s270,00/);
      await expect(tile("Ticket médio")).toContainText(/R\$\s38,57/);
      await expect(tile("Ocupação")).toContainText("20%");
      await expect(page.getByText("6 pessoas seguem a casa hoje.")).toBeVisible();
      await expect(page.getByText("O que é:")).toHaveCount(0);
      await noHScroll(page);
      await page.getByRole("button", { name: /Conversão dos pedidos: como é calculado/ }).click();
      await expect(page.getByText(/Pedidos pagos dividido pelos pedidos criados/)).toBeVisible();
      await expect(page.getByText(/De onde vem:/)).toBeVisible();
      await page.getByRole("tab", { name: "90 dias" }).click();
      await expect.poll(() => calls.filter((c) => c.name === "house_indicators").map((c) => c.body.p_days)).toContain(90);
      await expect(page.getByText(/Comparados com os 90 dias anteriores/)).toBeVisible();
      await noHScroll(page);
    });

    test("Indicadores da casa: equipe não vê dinheiro nem avaliações; sem permissão some; erro do servidor sem detalhe técnico", async ({ page }) => {
      const P = (current, previous = 0) => ({ current, previous });
      await api(page, { rpc: { house_indicators: { days: 30, role: "equipe", metrics: { pedidos_criados: P(7, 2), pedidos_pagos: P(3, 2), volume_cents: P(27000, 13000), nota_media: P(4.5, 3), reembolsos: P(1, 0) }, snapshot: { seguidores_total: 1, ocupacao_pct: null, avaliacoes_sem_resposta: 2 } } } });
      await page.goto("/tests/browser/ui-harness.html?c=indicators");
      await expect(page.getByRole("heading", { name: "Indicadores da casa" })).toBeVisible();
      await expect(page.locator("li").filter({ hasText: "Pedidos criados" })).toContainText("7");
      for (const t of ["Valor vendido", "Ticket médio", "Nota média", "Reembolsos pedidos", "Avaliações"]) await expect(page.locator("li").filter({ hasText: t })).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("R$");
      await expect(page.getByText("1 pessoa segue a casa hoje.")).toBeVisible();
      const p2 = await page.context().newPage();
      await api(p2, { rpc: { house_indicators: { status: 403, body: { message: "sem_permissao" } } } });
      await p2.goto("/tests/browser/ui-harness.html?c=indicators");
      await p2.waitForTimeout(800);
      await expect(p2.getByRole("heading", { name: "Indicadores da casa" })).toHaveCount(0);
      const p3 = await page.context().newPage();
      await api(p3, { rpc: { house_indicators: { status: 500, body: { message: "relation pg_x failed sqlstate 42P01" } } } });
      await p3.goto("/tests/browser/ui-harness.html?c=indicators");
      await expect(p3.getByRole("alert")).toContainText("Não foi possível carregar os indicadores.");
      await expect(p3.getByRole("alert")).not.toContainText(/pg_|sqlstate/i);
    });

    test("Indicadores da plataforma: grupos, variação, período e 'como é calculado'", async ({ page }) => {
      const P = (current, previous = 0) => ({ current, previous });
      const body = (days) => ({ days, previous_since: "2026-09-17T12:00:00Z", metrics: {
        novas_contas: P(30, 10), novas_casas: P(4, 2), novas_casas_pagantes: P(1, 2), cancelamentos: P(2, 1), ativos_no_periodo: P(40, 20), casas_ativas_no_periodo: P(3, 2), volume_cents: P(3100000, 500000), comissao_cents: P(300000, 50000), casas_que_venderam: P(2, 1),
        receita_assinatura_cents: P(1099000, 2697000), receita_divulgacao_cents: P(400000, 0), receita_creditos_cents: P(300000, 0), cobrancas_vencidas: P(1, 1), cobrancas_canceladas: P(1, 1),
        reembolsos_pedidos: P(2, 1), reembolsos_feitos: P(1, 1), pagamentos_estornados: P(2, 0), reembolsos_plano_cents: P(8990, 1234), pagamentos_contestados: P(1, 0),
        casos_disputa: P(1, 0), incidentes: P(2, 4), casos_abertos: P(5, 1), casos_resolvidos: P(2, 1), casos_com_resposta: P(3, 1), casos_resposta_no_prazo: P(2, 1),
        casos_sem_resposta_no_prazo: P(1, 0), primeira_resposta_mediana_h: P(2, 5), ia_respostas: P(3, 1), ia_tokens_entrada: P(600, 10), ia_tokens_saida: P(150, 5),
        mensagens: P(40, 10), pedidos_criados: P(7, 1), reservas_criadas: P(1, 0) },
        snapshot: { usuarios_total: 70, casas_total: 6, casas_por_plano: { gratis: 3, base: 2, maximo: 1 }, atividade_desde: "2026-11-16", ativos_7d: 20, ativos_30d: 33, casas_ativas_30d: 5, assinantes_base: 2, assinantes_retidos: 1, casos_em_aberto: 3 } });
      const calls = await api(page, { rpc: { admin_indicators: (b) => body(b.p_days) } });
      await page.goto("/tests/browser/ui-harness.html?c=adminind");
      await expect(page.getByRole("heading", { name: "Indicadores da plataforma" })).toBeVisible();
      const tile = (name) => page.locator("li").filter({ hasText: name });
      await expect(tile("Novas contas")).toContainText("30");
      await expect(tile("Novas contas")).toContainText("+200% sobre o período anterior");
      await expect(tile("Casas novas que já pagaram plano")).toContainText("25%");
      await expect(tile("Volume transacionado")).toContainText(/R\$\s31\.000,00/);
      await expect(tile("Receita total")).toContainText(/R\$\s20\.990,00/);
      await expect(tile("Incidentes graves")).toContainText("−50% sobre o período anterior");
      await expect(tile("Primeira resposta")).toContainText("2 h");
      await expect(tile("Respondidos no prazo")).toContainText("66,7%");
      await expect(tile("Texto processado pela IA")).toContainText("750");
      await expect(tile("Retenção de assinantes")).toContainText("50%");
      await expect(tile("Casas que voltaram ao Grátis")).toContainText("+100% sobre o período anterior");
      await expect(tile("Pessoas ativas no período")).toContainText("40");
      await expect(page.getByText(/registro dos dias de atividade começou em 16\/11\/2026/)).toBeVisible();
      await expect(tile("Casas em plano pago")).toContainText("3");
      await expect(page.getByText("Casas por plano hoje: Grátis 3 · Essencial 2 · Profissional 0 · Premium 1.")).toBeVisible();
      await expect(page.getByText("O que é:")).toHaveCount(0);
      await noHScroll(page);
      await page.getByRole("button", { name: /Respondidos no prazo: como é calculado/ }).click();
      await expect(page.getByText(/dentro do prazo/)).toBeVisible();
      await expect(page.getByText(/De onde vem:/)).toBeVisible();
      await page.getByRole("tab", { name: "7 dias" }).click();
      await expect.poll(() => calls.filter((c) => c.name === "admin_indicators").map((c) => c.body.p_days)).toContain(7);
      await expect(page.getByText(/Comparados com os 7 dias anteriores/)).toBeVisible();
      await noHScroll(page);
    });

    test("Indicadores da plataforma: quem não é administração não vê o cartão; erro do servidor sem detalhe técnico", async ({ page }) => {
      await api(page, { rpc: { admin_indicators: { status: 403, body: { message: "not_admin" } } } });
      await page.goto("/tests/browser/ui-harness.html?c=adminind");
      await page.waitForTimeout(800);
      await expect(page.getByRole("heading", { name: "Indicadores da plataforma" })).toHaveCount(0);
      const p3 = await page.context().newPage();
      await api(p3, { rpc: { admin_indicators: { status: 500, body: { message: "relation pg_x failed sqlstate 42P01" } } } });
      await p3.goto("/tests/browser/ui-harness.html?c=adminind");
      await expect(p3.getByRole("alert")).toContainText("Não foi possível carregar os indicadores.");
      await expect(p3.getByRole("alert")).not.toContainText(/pg_|sqlstate/i);
    });

    test("CPF/CNPJ: digita, valida, guarda uma vez e mostra só o final", async ({ page }) => {
      let set = false;
      const calls = await api(page, { rpc: {
        my_tax_id_status: () => (set ? { has_house: true, set: true, kind: "cpf", masked: "***.***.***-25", subscribed: false } : { has_house: true, set: false, subscribed: false }),
        my_tax_id_set: () => { set = true; return { kind: "cpf" }; },
      } });
      await page.goto("/tests/browser/ui-harness.html?c=tax");
      const input = page.getByLabel("CPF ou CNPJ");
      const save = page.getByRole("button", { name: "Guardar documento" });
      await expect(save).toBeDisabled();
      await input.fill("52998224726"); // dígito errado
      await expect(save).toBeDisabled();
      await input.fill("529.982.247-2"); await expect(save).toBeDisabled();
      await input.fill("52998224725");
      await expect(input).toHaveValue(CPF);
      await expect(save).toBeEnabled();
      await noHScroll(page);
      await save.dblclick(); // clique duplo: só uma chamada
      await expect(page.getByText("Informado")).toBeVisible();
      await expect(page.getByText("***.***.***-25")).toBeVisible();
      expect(calls.filter((c) => c.name === "my_tax_id_set")).toHaveLength(1);
      expect(calls.find((c) => c.name === "my_tax_id_set").body).toEqual({ p_doc: CPF });
      await expect(page.locator("body")).not.toContainText("529.982.247");
      await noHScroll(page);
    });

    test("CPF/CNPJ: CNPJ alfanumérico em minúsculas vira maiúsculas e é aceito; texto malicioso é filtrado", async ({ page }) => {
      await api(page, { rpc: { my_tax_id_status: { has_house: true, set: false, subscribed: true } } });
      await page.goto("/tests/browser/ui-harness.html?c=tax");
      const input = page.getByLabel("CPF ou CNPJ");
      await input.fill("12abc34501de35");
      await expect(input).toHaveValue("12.ABC.345/01DE-35");
      await expect(page.getByRole("button", { name: "Guardar documento" })).toBeEnabled();
      await input.fill("<img src=x onerror=alert(1)>");
      expect(await input.inputValue()).toMatch(/^[0-9A-Z./-]*$/);
      await input.fill("1".repeat(5000));
      expect((await input.inputValue()).length).toBeLessThanOrEqual(18);
      await expect(page.getByText("Informe o CPF ou CNPJ da casa")).toBeVisible(); // casa já assinante: texto sem bloquear
      await noHScroll(page);
    });

    test("CPF/CNPJ: erro técnico do servidor não aparece cru; mensagem em português aparece", async ({ page }) => {
      await api(page, { rpc: {
        my_tax_id_status: { has_house: true, set: false, subscribed: false },
        my_tax_id_set: { status: 400, body: { code: "XX000", message: "SQLSTATE 42P01 relation \"public.house_tax_ids\" does not exist at character 17" } },
      } });
      await page.goto("/tests/browser/ui-harness.html?c=tax");
      await page.getByLabel("CPF ou CNPJ").fill("52998224725");
      await page.getByRole("button", { name: "Guardar documento" }).click();
      await expect(page.getByText("Não foi possível guardar agora.")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("SQLSTATE");
    });

    test("CPF/CNPJ: máscara vinda do servidor com HTML não é exibida", async ({ page }) => {
      await api(page, { rpc: { my_tax_id_status: { has_house: true, set: true, kind: "cpf", masked: "<img src=x onerror=window.__xss=1>", subscribed: true } } });
      await page.goto("/tests/browser/ui-harness.html?c=tax");
      await expect(page.getByText("Informado")).toBeVisible();
      expect(await page.evaluate(() => window.__xss)).toBeUndefined();
      await expect(page.locator("body")).not.toContainText("<img");
    });

    test("Vagas: mostra o valor proporcional, abre o pagamento (Pix) uma vez e trata erro", async ({ page }) => {
      const calls = await api(page, {
        rpc: { my_seat_status: { has_house: true, subscribed: true, included: 1, extra: 0, in_use: 1, quote: { amount_cents: 2660, monthly_cents: 3990, days_left: 20, days_total: 30, cycle_end: "2026-12-05" }, blocked: null, release_to: null, release_on: null } },
        fn: { "platform-billing": { error: "A casa precisa informar o CPF ou CNPJ em Planos antes de contratar." } },
      });
      await page.goto("/tests/browser/ui-harness.html?c=seat");
      await expect(page.getByText("R$ 39,90/mês")).toBeVisible();
      await expect(page.getByText("20 dias que faltam")).toBeVisible();
      await expect(page.getByText("05/12/2026")).toBeVisible();
      await noHScroll(page);
      const pix = page.getByRole("button", { name: /Contratar com Pix/ });
      await expect(pix).toContainText("R$ 26,60");
      await pix.click();
      await expect(page.getByText("A casa precisa informar o CPF ou CNPJ em Planos antes de contratar.")).toBeVisible();
      const seatCalls = calls.filter((c) => c.kind === "fn");
      expect(seatCalls).toHaveLength(1);
      expect(seatCalls[0].body).toEqual({ action: "seat", method: "pix" });
      await expect(pix).toBeEnabled(); // volta ao normal depois do erro
    });

    test("Vagas: reduzir pede confirmação, agenda e permite desfazer; cancelar não envia nada", async ({ page }) => {
      let status = { has_house: true, subscribed: true, included: 1, extra: 3, in_use: 2, quote: null, blocked: null, release_to: null, release_on: null };
      const calls = await api(page, { rpc: {
        my_seat_status: () => status,
        my_seat_release_schedule: (b) => { status = { ...status, release_to: b.p_keep, release_on: "2026-12-05" }; return { keep: b.p_keep, effective_on: "2026-12-05" }; },
        my_seat_release_undo: () => { status = { ...status, release_to: null, release_on: null }; return {}; },
      } });
      await page.goto("/tests/browser/ui-harness.html?c=seat");
      await expect(page.getByText("3 vagas extras").first().or(page.getByText("Vagas extras:"))).toBeVisible();
      const sel = page.getByLabel("Quantas vagas extras manter");
      await expect(sel.locator("option")).toHaveText(["1", "2"]); // em uso 2 com 1 incluída → nunca abaixo de 1 extra
      await noHScroll(page);
      await page.getByRole("button", { name: "Reduzir", exact: true }).click();
      await page.getByRole("button", { name: "Voltar" }).click();
      expect(calls.filter((c) => c.name === "my_seat_release_schedule")).toHaveLength(0);
      await sel.selectOption("1");
      await page.getByRole("button", { name: "Reduzir", exact: true }).click();
      await page.getByRole("button", { name: "Reduzir na renovação" }).click();
      await expect(page.getByText("Redução agendada: a casa passa a ter")).toBeVisible();
      await expect(page.getByText("05/12/2026")).toBeVisible();
      expect(calls.filter((c) => c.name === "my_seat_release_schedule").map((c) => c.body)).toEqual([{ p_keep: 1 }]);
      await page.getByRole("button", { name: "Desfazer redução" }).click();
      await expect(page.getByText("Redução agendada: a casa passa a ter")).toHaveCount(0);
    });

    test("Vagas: sem assinatura a tela some; bloqueada mostra o motivo; dados absurdos do servidor não quebram", async ({ page }) => {
      await api(page, { rpc: { my_seat_status: { has_house: true, subscribed: false } } });
      await page.goto("/tests/browser/ui-harness.html?c=seat");
      await expect(page.locator("main")).toBeEmpty();
      const p2 = await page.context().newPage();
      await api(p2, { rpc: { my_seat_status: { has_house: true, subscribed: true, included: -5, extra: "NaN", in_use: 1e99, quote: { amount_cents: -1 }, blocked: "x".repeat(900), release_to: "abc", release_on: "<b>" } } });
      await p2.goto("/tests/browser/ui-harness.html?c=seat");
      await expect(p2.getByText("Vagas de equipe")).toBeVisible();
      await expect(p2.getByRole("button", { name: /Contratar/ })).toHaveCount(0);
      expect((await p2.locator("main").innerText()).length).toBeLessThan(900);
    });
  });
}

test.describe("administração", () => {
  test.use({ viewport: { width: 375, height: 740 } });
  test("CPF/CNPJ das casas: exige motivo, mostra o documento, corrige só com documento válido", async ({ page }) => {
    const calls = await api(page, { rpc: {
      admin_houses_plans: [{ house_id: "11111111-1111-1111-1111-111111111111", name: "Casa A" }],
      admin_house_tax_id: { set: true, kind: "cnpj", doc: "12.ABC.345/01DE-35", set_at: "2026-11-16T00:00:00Z" },
      admin_house_tax_id_set: { kind: "cnpj" },
    } });
    await page.goto("/tests/browser/ui-harness.html?c=admintax");
    const view = page.getByRole("button", { name: "Consultar" });
    await page.getByLabel("Casa").selectOption({ label: "Casa A" });
    await expect(view).toBeDisabled();
    await page.getByLabel("Motivo").fill("curto");
    await expect(view).toBeDisabled();
    await page.getByLabel("Motivo").fill("conferir nota fiscal do cliente");
    await expect(view).toBeEnabled();
    await noHScroll(page);
    await view.click();
    await expect(page.getByText("CNPJ: 12.ABC.345/01DE-35")).toBeVisible();
    const fix = page.getByRole("button", { name: "Corrigir" });
    await page.getByLabel("Novo documento").fill("123");
    await expect(fix).toBeDisabled();
    await page.getByLabel("Novo documento").fill("11222333000181");
    await expect(fix).toBeEnabled();
    await fix.click();
    await expect(page.getByText("Documento corrigido e registrado.")).toBeVisible();
    expect(calls.filter((c) => c.name === "admin_house_tax_id_set").map((c) => c.body)).toEqual([{ p_house: "11111111-1111-1111-1111-111111111111", p_doc: "11.222.333/0001-81", p_reason: "conferir nota fiscal do cliente" }]);
    await expect(page.getByText("CNPJ: 12.ABC.345/01DE-35")).toHaveCount(0); // depois de corrigir o número antigo some da tela
  });

  test("CPF/CNPJ das casas: o documento consultado some da tela sozinho", async ({ page }) => {
    await page.clock.install();
    await api(page, { rpc: { admin_houses_plans: [{ house_id: "11111111-1111-1111-1111-111111111111", name: "Casa A" }], admin_house_tax_id: { set: true, kind: "cpf", doc: "529.982.247-25" } } });
    await page.goto("/tests/browser/ui-harness.html?c=admintax");
    await page.getByLabel("Casa").selectOption({ label: "Casa A" });
    await page.getByLabel("Motivo").fill("conferir nota fiscal do cliente");
    await page.getByRole("button", { name: "Consultar" }).click();
    await expect(page.getByText("CPF: 529.982.247-25")).toBeVisible();
    await page.clock.fastForward(31_000);
    await expect(page.getByText("CPF: 529.982.247-25")).toHaveCount(0);
  });
});

test.describe("cobrança (administração)", () => {
  test.use({ viewport: { width: 375, height: 740 } });
  const CFG = { enabled: true, notice_days: 7, tolerance_business_days: 3, total_block_days: 30, total_block_next: { days: 15, from: "2099-01-10" }, pix_discount: { enabled: true, pct: 5, ends_days_before: 1 }, methods: {}, provider: {} };

  test("mostra o prazo em vigor e a mudança já avisada; valores inválidos não deixam salvar", async ({ page }) => {
    const calls = await api(page, { rest: { platform_settings: [{ value: CFG }] }, rpc: { admin_houses_plans: [] } });
    await page.goto("/tests/browser/ui-harness.html?c=billing");
    await expect(page.getByText("Prazo do bloqueio total em vigor: 30 dias.")).toBeVisible();
    await expect(page.getByText("A mudança para 15 dias já foi avisada às casas e passa a valer em 10/01/2099")).toBeVisible();
    await noHScroll(page);
    const save = page.getByRole("button", { name: "Salvar regras" });
    await expect(save).toBeDisabled(); // nada mudou
    const notice = page.getByText("Aviso antes do vencimento (dias)").locator("..").getByRole("textbox");
    for (const bad of ["-5", "abc", "999", "1e3", "<b>", ""]) {
      await notice.fill(bad);
      await expect(save).toBeDisabled();
    }
    await notice.fill("7");
    await page.getByLabel("Desconto (%)").fill("100");
    await expect(save).toBeDisabled(); // desconto absurdo
    await page.getByLabel("Desconto (%)").fill("5");
    expect(calls.filter((c) => c.name === "admin_set_setting")).toHaveLength(0);
  });

  test("sem mudança agendada, explica a regra dos 30 dias", async ({ page }) => {
    await api(page, { rest: { platform_settings: [{ value: { ...CFG, total_block_next: undefined } }] }, rpc: { admin_houses_plans: [] } });
    await page.goto("/tests/browser/ui-harness.html?c=billing");
    await expect(page.getByText("Se você mudar esse prazo, as casas recebem um aviso e a mudança só vale 30 dias depois.")).toBeVisible();
  });
});

test.describe("faturas da casa (Pix com desconto)", () => {
  test.use({ viewport: { width: 375, height: 740 } });
  const inv = (o) => ({ id: "c1", kind: "plan", description: "Plano Máximo — dezembro", amount_cents: 20000, due_date: "2099-12-10", status: "aberta", paid_at: null, idempotency_key: "plan:x", pix_discount_cents: 1000, pix_discount_until: "2099-12-09", ...o });
  const common = { rpc: { my_house_billing_status: { house_id: "h1", plan: "maximo" } } };

  test("mostra o valor com desconto só no Pix, o cartão segue cheio, e o clique pede o pagamento certo", async ({ page }) => {
    const calls = await api(page, { ...common, rest: { platform_charges: [inv()], profiles: [], houses: [] }, fn: { "platform-billing": { error: "Pagamento indisponível agora." } } });
    await page.goto("/tests/browser/ui-harness.html?c=invoices");
    await expect(page.getByRole("button", { name: "Pagar com Pix (R$ 190,00)" })).toBeVisible();
    await expect(page.getByText("Pix com 5% de desconto até 09/12. No cartão, valor cheio.")).toBeVisible();
    await expect(page.getByText("R$ 200,00").first()).toBeVisible();
    await noHScroll(page);
    await page.getByRole("button", { name: /Pagar com Pix/ }).click();
    await expect(page.getByText("Pagamento indisponível agora.")).toBeVisible();
    expect(calls.filter((c) => c.kind === "fn").map((c) => c.body)).toEqual([{ action: "pay", charge_id: "c1", method: "pix" }]);
  });

  test("sem desconto (vencido o prazo ou desligado) o botão é o normal e sem texto de desconto", async ({ page }) => {
    await api(page, { ...common, rest: { platform_charges: [inv({ pix_discount_cents: 0, pix_discount_until: null }), inv({ id: "c2", pix_discount_until: "2000-01-01" })] } });
    await page.goto("/tests/browser/ui-harness.html?c=invoices");
    await expect(page.getByRole("button", { name: "Pagar com Pix", exact: true })).toHaveCount(2);
    await expect(page.getByText(/de desconto até/)).toHaveCount(0);
  });

  test("dados absurdos do servidor (desconto maior que a fatura, negativo, texto) nunca mostram valor estranho", async ({ page }) => {
    await api(page, { ...common, rest: { platform_charges: [inv({ pix_discount_cents: 999999 }), inv({ id: "c2", pix_discount_cents: -500 }), inv({ id: "c3", pix_discount_cents: "abc" })] } });
    await page.goto("/tests/browser/ui-harness.html?c=invoices");
    const txt = await page.locator("main").innerText();
    expect(txt).not.toMatch(/-\s?R\$|NaN|undefined|R\$ 0,00\)|R\$ -/);
  });
});
