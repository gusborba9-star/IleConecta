// Layout e navegação da conta de casa (20/11/2026): Início com ferramentas, barra de baixo no celular, seções recolhidas,
// Planos em abas, Pedidos (em andamento/histórico), Recebimentos e Crescer. Cada atalho tem de levar exatamente à tela certa.
import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), HID = U(60);
const perfilCasa = { id: ME, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const perfilPessoa = { ...perfilCasa, account_type: "pessoa", display_name: "Maria Cliente" };
const consent = (...keys) => keys.map((k) => ({ doc_key: k, doc_version: "2026-11-rascunho-11", accepted_at: "2026-11-01T10:00:00Z" }));
const house = { id: HID, owner_id: ME, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "intermediario", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA" } };
const pendencias = (counts = {}, toPayCount = 0) => ({
  house_id: HID, house_name: "Casa Axé", role: "titular", total: 3, overdue: 0, counts, items: [],
  to_pay: toPayCount ? { charges: Array.from({ length: toPayCount }, (_, i) => ({ id: U(300 + i), kind: "plano", description: "Plano", amount_cents: 9900, due_date: "2026-12-25", status: "pendente", pix_discount_cents: 0, overdue: false })) } : null,
});
const order = (n, status, title) => ({ id: U(200 + n), service_id: null, title, price_cents: 5000, note: null, status, client_id: U(9), created_at: `2026-11-1${n}T10:00:00Z`, stages_total: 1, modality: null, scheduled_at: null, profiles: { display_name: `Cliente ${n}` } });
const entrar = async (page, { rest = {}, rpc = {} } = {}) => api(page, { rest: { profiles: perfilCasa, legal_consents: consent("termos_casa"), houses: [house], service_orders: [], ...rest }, rpc: { house_pending_center: pendencias(), ...rpc } });

test.describe("Início da casa: cada ferramenta leva ao lugar certo", () => {
  test("atalhos do Início apontam para as telas certas (celular 375)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Olá, Casa Axé/ })).toBeVisible();
    const alvo = {
      "Pessoas": "/pessoas", "Novo serviço": `/casa/${ME}?aba=servicos&novo=1`, "Novo ritual": `/casa/${ME}?aba=rituais&novo=1`,
      "Comunidade": "/comunidade", "Crescer": "/impulsionar", "Planos": "/planos", "Recebimentos": "/recebimentos",
      "Assistente": "/perfil", "Editar página": `/casa/${ME}?editar=1`,
    };
    const area = page.getByRole("region", { name: "Ferramentas" }).or(page.locator("section[aria-labelledby=ferramentas]"));
    for (const [nome, href] of Object.entries(alvo)) {
      await expect(area.getByRole("link", { name: new RegExp(`^${nome}`) }), nome).toHaveAttribute("href", href);
    }
    await noHScroll(page);
  });

  test("frase do topo reflete o que espera a casa; indicadores começam recolhidos; 'nada pendente' não aparece com fatura a pagar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page, { rpc: { house_pending_center: { ...pendencias({ pedido_para_iniciar: 2 }, 1), total: 0 } } });
    await page.goto("/");
    await expect(page.getByText("3 assuntos esperam por você.")).toBeVisible();
    await expect(page.getByText("O que precisa de você hoje")).toHaveCount(0);
    await expect(page.getByText("Nada pendente agora.")).toHaveCount(0);
    const ind = page.getByRole("button", { name: /^Indicadores da casa/ });
    await expect(ind).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("tablist", { name: "Período" })).toHaveCount(0);
    await ind.click();
    await expect(page.getByRole("tablist", { name: "Período" })).toBeVisible();
    await noHScroll(page);
  });

  test("os quatro resumos têm a mesma altura e cada ferramenta tem anel", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page);
    await page.goto("/");
    await expect(page.locator('section[aria-label="Resumo da casa"] > a')).toHaveCount(4);
    const caixas = await page.locator('section[aria-label="Resumo da casa"] > a > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(caixas).toHaveLength(4);
    expect(new Set(caixas).size).toBe(1);
    const aneis = await page.locator("section[aria-labelledby=ferramentas] .tool-ring").count();
    expect(aneis).toBeGreaterThanOrEqual(12);
  });

  test("seções de configuração começam recolhidas, abrem ao tocar e o estado é lembrado", async ({ page }) => {
    await entrar(page);
    await page.goto("/");
    for (const nome of ["Divulgar a casa", "Assistente", "Preferências"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${nome}`) })).toHaveAttribute("aria-expanded", "false");
    }
    const botao = page.getByRole("button", { name: /^Preferências/ });
    const painel = page.locator(`[id="${await botao.getAttribute("aria-controls")}"]`);
    await expect(painel).toBeHidden();
    await botao.click();
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    await expect(painel).toBeVisible();
    await expect(painel).toContainText(/Não perturbe/i);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Preferências/ })).toHaveAttribute("aria-expanded", "true");
  });

  test("o link antigo /?foco=recebimento leva à tela Recebimentos", async ({ page }) => {
    await entrar(page);
    await page.goto("/?foco=recebimento");
    await expect(page).toHaveURL(/\/recebimentos\?foco=recebimento$/);
    await expect(page.getByRole("heading", { level: 1, name: "Recebimentos" })).toBeVisible();
  });
});

test.describe("barra de baixo e menu no celular", () => {
  test("mostra 4 atalhos + Mais com as bolinhas de pendências; Mais abre o menu completo", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page, { rpc: { house_pending_center: pendencias({ conversa_sem_resposta: 2, assunto_da_assistente: 1, pedido_para_iniciar: 1, mensalidade_vencida: 4 }, 2) } });
    await page.goto("/");
    const barra = page.getByRole("navigation", { name: "Atalhos do celular" });
    await expect(barra).toBeVisible();
    for (const [nome, href] of [["Início", "/"], ["Mensagens", "/mensagens"], ["Pedidos", "/pedidos"], ["Agenda", "/agenda"]]) {
      await expect(barra.getByRole("link", { name: new RegExp(`^${nome}`) })).toHaveAttribute("href", href);
    }
    await expect(barra.getByRole("link", { name: /^Mensagens/ })).toContainText("3 pendentes");
    await expect(barra.getByRole("link", { name: /^Pedidos/ })).toContainText("1 pendente");
    await barra.getByRole("button", { name: "Mais" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    for (const t of ["Minha casa", "Crescer", "Explorar"]) await expect(menu.getByText(t, { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: /^Planos e faturas/ })).toContainText("2 pendentes");
    await expect(menu.getByRole("link", { name: /^Membros/ })).toContainText("4 pendentes");
    for (const [nome, href] of [["Recebimentos", "/recebimentos"], ["Impulsionar e destaques", "/impulsionar"], ["Pessoas da casa", "/pessoas"], ["Equipe da casa", "/equipe"], ["Divulgação", "/divulgacao"]]) {
      await expect(menu.getByRole("link", { name: new RegExp(`^${nome}`) }), nome).toHaveAttribute("href", href);
    }
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("no computador a barra de baixo não aparece; dentro de uma conversa ela sai da frente; cliente não a vê", async ({ page }) => {
    await entrar(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Atalhos do celular" })).toBeHidden();
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(`/mensagens/${U(9)}`);
    await expect(page.getByRole("navigation", { name: "Atalhos do celular" })).toHaveCount(0);
  });

  test("conta de cliente continua com o menu de cliente, sem a barra de baixo da casa", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await api(page, { rest: { profiles: perfilPessoa, legal_consents: consent("termos_cliente", "dados_sensiveis") }, rpc: {} });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Atalhos do celular" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
  });
});

test.describe("Planos e faturas em abas", () => {
  test("abre em Meu plano; Cobranças e Mudar de plano trocam o painel; teclado percorre as abas", async ({ page }) => {
    await entrar(page);
    await page.goto("/planos");
    const abas = page.getByRole("tablist", { name: "Planos e faturas" });
    await expect(abas.getByRole("tab", { name: "Meu plano" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await abas.getByRole("tab", { name: "Meu plano" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(abas.getByRole("tab", { name: "Mudar de plano" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Cresça no seu ritmo" })).toBeVisible();
    await page.keyboard.press("End");
    await expect(abas.getByRole("tab", { name: "Cobranças" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Cresça no seu ritmo" })).toHaveCount(0);
  });
  test("links com fatura ou ?aba= abrem na aba certa", async ({ page }) => {
    await entrar(page);
    await page.goto(`/planos?foco=${U(300)}`);
    await expect(page.getByRole("tab", { name: "Cobranças" })).toHaveAttribute("aria-selected", "true");
    await page.goto("/planos?aba=mudar");
    await expect(page.getByRole("tab", { name: "Mudar de plano" })).toHaveAttribute("aria-selected", "true");
    await page.goto("/planos?aba=cobrancas");
    await expect(page.getByRole("tab", { name: "Cobranças" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Pedidos da casa", () => {
  const pedidos = [order(1, "confirmado", "Consulta de búzios"), order(2, "concluido", "Limpeza espiritual"), order(3, "em_andamento", "Trabalho de abertura"), order(4, "cancelado", "Jogo cancelado")];
  test("Em andamento lista os abertos (mais novo primeiro); Histórico lista os encerrados", async ({ page }) => {
    await entrar(page, { rest: { service_orders: pedidos } });
    await page.goto("/pedidos");
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Em andamento/ })).toHaveAttribute("aria-selected", "true");
    const lista = page.getByRole("tabpanel");
    await expect(lista).toContainText("Trabalho de abertura");
    await expect(lista).toContainText("Consulta de búzios");
    await expect(lista).not.toContainText("Limpeza espiritual");
    const textos = await lista.innerText();
    expect(textos.indexOf("Trabalho de abertura")).toBeLessThan(textos.indexOf("Consulta de búzios"));
    await page.getByRole("tab", { name: "Histórico" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Limpeza espiritual");
    await expect(page.getByRole("tabpanel")).toContainText("Jogo cancelado");
    await expect(page.getByRole("tabpanel")).not.toContainText("Consulta de búzios");
  });
  test("link do histórico (?aba=historico) e conta de cliente é mandada para o Início", async ({ page }) => {
    await entrar(page, { rest: { service_orders: pedidos } });
    await page.goto("/pedidos?aba=historico");
    await expect(page.getByRole("tab", { name: "Histórico" })).toHaveAttribute("aria-selected", "true");
  });
  test("cliente que abre /pedidos volta ao Início", async ({ page }) => {
    await api(page, { rest: { profiles: perfilPessoa, legal_consents: consent("termos_cliente", "dados_sensiveis") }, rpc: {} });
    await page.goto("/pedidos");
    await expect(page).toHaveURL(/\/$/);
  });
  test("a lista de serviços avisa quantos pedidos estão em andamento e leva a Pedidos", async ({ page }) => {
    await entrar(page, { rest: { service_orders: pedidos } });
    await page.goto(`/casa/${ME}?aba=servicos`);
    await expect(page.getByText("2 pedidos em andamento")).toBeVisible();
    await page.getByRole("button", { name: "Ver em Pedidos" }).click();
    await expect(page).toHaveURL(/\/pedidos$/);
  });
});

test.describe("Crescer: Impulsionar e Destaques lado a lado", () => {
  test("as duas telas têm as duas abas, com a atual marcada, e /crescer abre Impulsionar", async ({ page }) => {
    await entrar(page);
    await page.goto("/impulsionar");
    const nav = page.getByRole("navigation", { name: /Alcance pago/ });
    await expect(nav.getByRole("link", { name: /^Impulsionar/ })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: /^Destaques nos feeds/ }).click();
    await expect(page).toHaveURL(/\/destaques$/);
    await expect(page.getByRole("navigation", { name: /Alcance pago/ }).getByRole("link", { name: /^Destaques/ })).toHaveAttribute("aria-current", "page");
    await page.goto("/crescer");
    await expect(page).toHaveURL(/\/impulsionar$/);
  });
});

test.describe("Recebimentos", () => {
  test("a tela explica quando os pagamentos ainda não foram liberados e não fica vazia", async ({ page }) => {
    await entrar(page);
    await page.goto("/recebimentos");
    await expect(page.getByRole("heading", { level: 1, name: "Recebimentos" })).toBeVisible();
    await expect(page.getByText(/ainda não foram liberados|Recebimento pela plataforma/).first()).toBeVisible();
  });
});

test.describe("sem rolagem lateral e texto a 200%", () => {
  for (const tela of ["/", "/pedidos", "/agenda", "/recebimentos", "/planos", "/planos?aba=mudar", "/planos?aba=cobrancas", "/impulsionar", "/destaques"]) {
    test(`320 px e 200%: ${tela}`, async ({ page }) => {
      await entrar(page);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(tela);
      await page.locator("h1").first().waitFor({ timeout: 5000 }).catch(() => {});
      await noHScroll(page);
      await page.setViewportSize({ width: 375, height: 740 });
      await page.addStyleTag({ content: "html{font-size:200% !important}" });
      await page.waitForTimeout(250);
      await noHScroll(page);
    });
  }
});

test.describe("Agenda da casa, Voltar, aparência no topo e caminhos sem repetição", () => {
  test.use({ viewport: { width: 375, height: 740 } });
  test("Agenda: tela própria com horários de atendimento e próximos atendimentos; cliente é mandado ao Início", async ({ page }) => {
    await entrar(page, { rest: { house_availability: [{ id: U(5), weekday: 1, start_time: "09:00:00", end_time: "12:00:00" }], house_calendar_items: [], house_blocks: [{ starts_at: "2099-03-10T13:00:00Z", ends_at: "2099-03-10T15:00:00Z", note: "Viagem" }] } });
    await page.goto("/agenda");
    await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agenda de atendimento" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Próximos compromissos" })).toBeVisible();
    await expect(page.getByText("Bloqueio: Viagem")).toBeVisible();
    await expect(page.getByText("9:00 às 12:00").or(page.getByText("09:00 às 12:00"))).toBeVisible();
    await noHScroll(page);
    const p2 = await page.context().newPage();
    await api(p2, { rest: { profiles: perfilPessoa, legal_consents: consent("termos_cliente") }, rpc: {} });
    await p2.goto("/agenda");
    await expect(p2).toHaveURL(/\/$/);
  });

  test("o Início não repete o que a barra de baixo já tem: sem atalhos de Pedidos, Agenda e Minha página entre as ferramentas", async ({ page }) => {
    await entrar(page);
    await page.goto("/");
    const area = page.locator("section[aria-labelledby=ferramentas]");
    await expect(area.getByRole("link", { name: /^Planos/ })).toBeVisible();
    for (const nome of ["Pedidos", "Agenda", "Minha página"]) await expect(area.getByRole("link", { name: new RegExp(`^${nome}`) })).toHaveCount(0);
  });

  test("Voltar: some nas telas principais; volta à tela anterior; link direto vai para o Início", async ({ page }) => {
    await entrar(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Voltar" })).toHaveCount(0);
    await page.locator("section[aria-labelledby=ferramentas]").getByRole("link", { name: /^Planos/ }).click();
    await expect(page).toHaveURL(/\/planos$/);
    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/pessoas");
    await page.goBack().catch(() => undefined);
    await page.goto("/recebimentos");
    await expect(page.getByRole("button", { name: "Voltar" })).toBeVisible();
    for (const t of ["/pedidos", "/agenda", "/mensagens"]) {
      await page.goto(t);
      await expect(page.getByRole("button", { name: "Voltar" }), t).toHaveCount(0);
    }
  });

  test("aparência no topo: um toque alterna claro, escuro e automático", async ({ page }) => {
    await entrar(page);
    await page.goto("/");
    const botao = page.getByRole("button", { name: /^Aparência:/ });
    await expect(botao).toBeVisible();
    const escuro = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    await page.evaluate(() => localStorage.removeItem("ile:tema"));
    await page.reload();
    await page.getByRole("button", { name: /^Aparência:/ }).click(); // automático -> claro
    await expect(page.getByRole("button", { name: /^Aparência: claro/ })).toBeVisible();
    expect(await escuro()).toBe(false);
    await page.getByRole("button", { name: /^Aparência:/ }).click(); // -> escuro
    await expect(page.getByRole("button", { name: /^Aparência: escuro/ })).toBeVisible();
    expect(await escuro()).toBe(true);
    await noHScroll(page);
  });

  test("topo no celular: sino e perfil à direita, com espaço entre eles", async ({ page }) => {
    await entrar(page);
    await page.goto("/");
    const marca = await page.locator("header a[href='/']").first().boundingBox();
    const sino = await page.getByRole("button", { name: /Notificações/ }).boundingBox();
    const perfil = await page.getByRole("button", { name: "Menu da conta" }).boundingBox();
    expect(sino.x).toBeGreaterThan(marca.x + marca.width + 40);
    expect(perfil.x - (sino.x + sino.width)).toBeGreaterThanOrEqual(4);
    expect(perfil.x + perfil.width).toBeLessThanOrEqual(375 - 8);
  });

  test("Perfil e assistente da casa: sem Reservas demonstrativas, Recomendado, Suas publicações nem Modo discreto repetido", async ({ page }) => {
    await entrar(page);
    await page.goto("/perfil");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const t of ["Reservas demonstrativas", "Recomendado para você", "Suas publicações", "Modo discreto"]) await expect(page.getByRole("heading", { name: t })).toHaveCount(0);
  });
});

test.describe("Faturas resumidas e Compare os planos no celular", () => {
  test.use({ viewport: { width: 375, height: 740 } });
  const inv = (i, status = "paga") => ({ id: `c${i}`, kind: "plan", description: `Mensalidade ${i}`, amount_cents: 29990, due_date: `2026-${String(12 - i).padStart(2, "0")}-17`, status, paid_at: null, idempotency_key: `plan:${i}`, pix_discount_cents: 0, pix_discount_until: null });
  test("mostra as abertas e as 3 mais recentes; o resto abre em 'Ver histórico completo'", async ({ page }) => {
    await entrar(page, { rest: { platform_charges: [inv(0, "aberta"), ...[1, 2, 3, 4, 5, 6].map((i) => inv(i))] }, rpc: { my_house_billing_status: { house_id: HID, plan: "intermediario" } } });
    await page.goto("/planos?aba=cobrancas");
    const card = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Faturas da plataforma" }) }).last();
    await expect(page.getByText("Mensalidade 3")).toBeVisible();
    await expect(page.getByText("Mensalidade 4")).toHaveCount(0);
    const mais = page.getByRole("button", { name: /Ver histórico completo \(3 mais antigas\)/ });
    await mais.click();
    await expect(page.getByText("Mensalidade 6")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mostrar só as recentes" })).toHaveAttribute("aria-expanded", "true");
    await noHScroll(page);
    void card;
  });

  test("Compare os planos: celular mostra um plano por vez, sem tabela cortada; computador mantém a tabela", async ({ page }) => {
    await entrar(page);
    await page.goto("/planos?aba=mudar");
    const grupo = page.getByRole("radiogroup", { name: "Plano a ver" });
    await expect(grupo).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    const radios = grupo.getByRole("radio");
    await expect(radios.first()).toBeVisible();
    await radios.last().click();
    await expect(radios.last()).toHaveAttribute("aria-checked", "true");
    await noHScroll(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: "Plano a ver" })).toHaveCount(0);
    await expect(page.locator("table").first()).toBeVisible();
  });
});

test.describe("Plano Grátis: ferramentas de plano superior aparecem como nos outros planos", () => {
  const gratis = { ...house, plan: "gratis" };
  const semCreditos = { has_house: true, limit: 0, used_month: 0, balance: 0, for_sale: true, packs: [], prices: { p80: 1900 } };

  test("Início não repete Momentos/Publicar: o caminho é a Comunidade; Momentos fica na faixa dela e no perfil", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page, { rest: { houses: [gratis] }, rpc: { my_ai_credit_status: semCreditos } });
    await page.goto("/");
    const area = page.locator("section[aria-labelledby=ferramentas]");
    await expect(area.getByRole("link", { name: /^Comunidade/ })).toHaveAttribute("href", "/comunidade");
    await expect(area.getByText(/^Momentos$/)).toHaveCount(0);
    await expect(area.getByText(/^Publicar$/)).toHaveCount(0);
  });

  test("Assistente sem franquia nem pacote: aviso com botão para comprar pacote, sem abrir a configuração", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page, { rest: { houses: [gratis] }, rpc: { my_ai_credit_status: semCreditos } });
    await page.goto("/");
    const area = page.locator("section[aria-labelledby=ferramentas]");
    await area.getByRole("button", { name: /^Assistente/ }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText(/a partir do plano/)).toBeVisible();
    await expect(dlg.getByText(/adquira um pacote de respostas/)).toBeVisible();
    await dlg.getByRole("button", { name: "Comprar pacote de respostas" }).click();
    await expect(page).toHaveURL(/\/planos\?aba=meu#creditos/);
  });

  test("/perfil no Grátis sem pacote mostra só o aviso (sem formulário) e o botão leva aos pacotes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page, { rest: { houses: [gratis], assistants: [] }, rpc: { my_ai_credit_status: semCreditos } });
    await page.goto("/perfil");
    await expect(page.getByText(/Assistente com franquia de respostas a partir do plano/)).toBeVisible();
    await expect(page.getByLabel(/Assistente ativada para clientes/)).toHaveCount(0);
    await noHScroll(page);
    await page.getByRole("link", { name: "Comprar pacote de respostas" }).click();
    await expect(page).toHaveURL(/\/planos\?aba=meu#creditos/);
  });

  test("com pacote comprado a Assistente volta a abrir normalmente", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page, { rest: { houses: [gratis] }, rpc: { my_ai_credit_status: { ...semCreditos, balance: 50, packs: [{ size: 80, remaining: 50, expires_at: "2027-02-01T00:00:00Z" }] } } });
    await page.goto("/");
    const area = page.locator("section[aria-labelledby=ferramentas]");
    await expect(area.getByRole("link", { name: /^Assistente/ })).toHaveAttribute("href", "/perfil");
  });
});

test.describe("Central de pendências: minimizar vira uma faixa no topo com o número", () => {
  const item = (kind, n, extra = {}) => ({ kind, priority: "normal", ref_id: U(900 + n), title: `${kind} ${n}`, detail: null, due_date: null, overdue: false, ...extra });
  const montar = (page, items, overdue = 0) => {
    const pend = { ...pendencias({ pedido_para_iniciar: items.length }), total: items.length, overdue, items };
    return entrar(page, { rpc: { house_pending_center: pend } });
  };
  test("Minimizar deixa só 'Central de pendências' + número vermelho; tocar reabre; lembra no aparelho", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await montar(page, Array.from({ length: 12 }, (_, i) => item("pedido_para_iniciar", i)));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Central de pendências" })).toBeVisible();
    await page.getByRole("button", { name: "Minimizar" }).click();
    await expect(page.getByRole("heading", { name: "Central de pendências" })).toHaveCount(0);
    const faixa = page.getByRole("button", { name: /^Central de pendências\s*, 12 pendentes/ });
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText("12");
    // o número tem fundo vermelho de verdade (a cor "destructive" já ficou sem estilo uma vez)
    const fundo = await faixa.locator("span[aria-hidden]").first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(fundo).not.toBe("rgba(0, 0, 0, 0)");
    const caixa = await faixa.boundingBox();
    expect(caixa.height).toBeLessThanOrEqual(64); // não ocupa espaço
    await expect(page.getByText("pedido_para_iniciar 3")).toHaveCount(0); // nada de lista
    await page.reload();
    await expect(page.getByRole("button", { name: /^Central de pendências\s*, 12 pendentes/ })).toBeVisible();
    await noHScroll(page);
    await page.getByRole("button", { name: /^Central de pendências\s*, 12 pendentes/ }).click();
    await expect(page.getByRole("heading", { name: "Central de pendências" })).toBeVisible();
  });
  test("o que é crítico (vencida, suporte) fica à mostra mesmo minimizado; o resto some atrás do número", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await montar(page, [item("pedido_para_iniciar", 1), item("suporte", 2), item("pedido_para_iniciar", 3, { overdue: true })], 1);
    await page.goto("/");
    await page.getByRole("button", { name: "Minimizar" }).click();
    const faixa = page.getByRole("button", { name: /^Central de pendências\s*, 3 pendentes, 1 vencida/ });
    await expect(faixa).toContainText("3");
    await expect(page.getByText("suporte 2")).toBeVisible();
    await expect(page.getByText("pedido_para_iniciar 3")).toBeVisible();
    await expect(page.getByText("pedido_para_iniciar 1")).toHaveCount(0);
    await noHScroll(page);
  });
  test("sem pendências não há faixa nem botão de minimizar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await montar(page, []);
    await page.goto("/");
    await expect(page.getByText("Nada pendente agora.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Minimizar" })).toHaveCount(0);
  });
});

test.describe("Ícones do Início agrupados por cor", () => {
  test("linhas: dourados, verdes, vermelhos com roxo no fim e Editar página sozinha", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await entrar(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Editar página/ })).toBeVisible();
    const linhas = await page.locator("section[aria-labelledby=ferramentas] .tool-tile").evaluateAll((els) => {
      // cada linha de cor é uma grade própria: agrupar pela grade (não pela posição, que oscila durante a animação de entrada)
      const grades = [];
      for (const e of els) { const g = e.parentElement; let i = grades.findIndex((x) => x.g === g); if (i < 0) { grades.push({ g, itens: [] }); i = grades.length - 1; } grades[i].itens.push(e.innerText.split("\n")[0].trim()); }
      return grades.map((x) => x.itens);
    });
    expect(linhas).toEqual([
      ["Crescer", "Planos", "Recebimentos"], // Avaliações só aparece com o recurso ligado; entra no começo desta linha
      ["Membros", "Pessoas", "Novo serviço", "Equipe"],
      ["Novo ritual", "Comunidade", "Divulgação", "Assistente"],
      ["Editar página"],
    ]);
  });
});
