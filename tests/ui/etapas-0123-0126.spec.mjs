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

for (const vp of [{ name: "celular 375", width: 375, height: 740 }, { name: "desktop", width: 1280, height: 800 }]) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

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
