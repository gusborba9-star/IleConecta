// Momentos das casas (17/11/2026): carrossel no feed, visualizador em tela cheia, publicar (Essencial: foto; Premium: foto e vídeo), denunciar.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), CASA_A = U(11), CASA_B = U(12), HID = U(60);
const consentsCli = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }];
const consentsCasa = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-12", accepted_at: "2026-11-01T10:00:00Z" }];
const profile = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Minha Casa" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = (plan) => ({ id: HID, owner_id: ME, name: "Minha Casa", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan, created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null } });
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const feed = [
  { owner_id: CASA_A, house_id: U(61), name: "Casa de Oxum", slug: "casa-de-oxum", avatar: null, followed: true, items: [
    { id: U(101), kind: "image", path: `${CASA_A}/a.jpg`, poster: null, caption: "Gira de hoje às 19h", created_at: iso(30), expires_at: iso(-1410), duration: null, link_kind: null, link_id: null, link_title: null },
    { id: U(102), kind: "video", path: `${CASA_A}/v.mp4`, poster: `${CASA_A}/p.jpg`, caption: null, created_at: iso(10), expires_at: iso(-1430), duration: 12, link_kind: "event", link_id: U(70), link_title: "Ritual de abertura" } ] },
  { owner_id: CASA_B, house_id: U(62), name: "Ilê Axé Omolu", slug: "ile-axe-omolu", avatar: null, followed: false, items: [
    { id: U(103), kind: "image", path: `${CASA_B}/b.jpg`, poster: null, caption: null, created_at: iso(300), expires_at: iso(-1140), duration: null, link_kind: null, link_id: null, link_title: null } ] },
];
// 1 pixel PNG para as imagens do bucket (a API simulada devolve JSON para qualquer arquivo)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const setup = async (page, type, plan, extra = {}) => {
  const calls = await api(page, {
    rest: { profiles: profile(type), legal_consents: type === "casa" ? consentsCasa : consentsCli, houses: type === "casa" ? [house(plan)] : [], stories: [], services: [], events: [], posts: [], ...(extra.rest ?? {}) },
    rpc: { house_follow_summary: { counts: {}, mine: [CASA_A, CASA_B] }, moments_feed: feed, report_moment: "ok", report_client_error: true, ...(extra.rpc ?? {}) },
  });
  await page.route("**/storage/v1/object/public/moments/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  return calls;
};
const png = (name = "foto.png") => ({ name, mimeType: "image/png", buffer: PNG });

test.describe("momentos das casas", () => {
  test("avatar do cartão: anel e foto formam um círculo só (mesmo tamanho e centro)", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    const anel = page.getByTestId("moment-card").first().locator("span.rounded-full").first();
    const foto = anel.locator("div").first();
    const [r, f] = [await anel.boundingBox(), await foto.boundingBox()];
    expect(Math.abs(r.width - f.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.height - f.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.x - f.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y - f.y)).toBeLessThanOrEqual(1);
  });

  test("página da casa: o anel dos momentos e a foto são um círculo só (sem segundo círculo deslocado)", async ({ page }) => {
    const hA = { id: U(61), owner_id: CASA_A, name: "Casa de Oxum", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "maximo", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } };
    await setup(page, "cliente", null, { rest: { houses: [hA] } });
    await page.goto(`/casa/${CASA_A}`);
    const botao = page.getByRole("button", { name: /Ver os momentos de/ });
    await expect(botao).toBeVisible();
    const [r, f] = [await botao.boundingBox(), await botao.locator("div").first().boundingBox()];
    for (const k of ["x", "y", "width", "height"]) expect(Math.abs(r[k] - f[k])).toBeLessThanOrEqual(1);
  });

  test("cliente: vê o carrossel (seguidas primeiro), sem 'Criar momento'; abre em tela cheia e navega", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    const cards = page.getByTestId("moment-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute("aria-label", /Casa de Oxum/);
    await expect(page.getByRole("button", { name: /Criar momento/ })).toHaveCount(0);
    await expect(page.getByText("Momento indisponível")).toHaveCount(0);
    await cards.first().click();
    const v = page.getByRole("dialog", { name: "Momentos de Casa de Oxum" });
    await expect(v).toBeVisible();
    await expect(v.getByText("Gira de hoje às 19h")).toBeVisible();
    await expect(v.getByRole("button", { name: "Falar com a casa" })).toBeVisible();
    await expect(v.getByText(/há 30 min/)).toBeVisible();
    await page.keyboard.press("ArrowRight"); // vídeo, ligado a um ritual
    await expect(v.getByRole("button", { name: /Ver ritual: Ritual de abertura/ })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(v.getByText("Gira de hoje às 19h")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("moment-viewer")).toHaveCount(0);
    await expect(cards.first()).toHaveAttribute("aria-label", /já vistos|Casa de Oxum/);
  });

  test("avançar até o fim passa para a próxima casa e fecha no último", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Momentos de Ilê Axé Omolu" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(v).toHaveCount(0);
  });

  test("tocar no lado direito avança e no esquerdo volta", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    const box = await v.locator("> div").boundingBox();
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
    await expect(v.getByRole("button", { name: /Ver ritual/ })).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5);
    await expect(v.getByText("Gira de hoje às 19h")).toBeVisible();
  });

  test("o botão 'voltar' do celular fecha o visualizador sem sair do feed", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await expect(page.getByTestId("moment-viewer")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("moment-viewer")).toHaveCount(0);
    await expect(page).toHaveURL(/\/comunidade/);
  });

  test("denunciar: escolhe o motivo e o banco recebe a denúncia", async ({ page }) => {
    const calls = await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").nth(1).click();
    await page.getByRole("button", { name: "Mais opções" }).click();
    await page.getByRole("menuitem", { name: "Denunciar" }).click();
    await page.getByRole("button", { name: "Enviar denúncia" }).click();
    await expect(page.getByText("Escolha o motivo.")).toBeVisible();
    await page.getByLabel("Golpe ou fraude").check();
    await page.getByRole("button", { name: "Enviar denúncia" }).click();
    await expect(page.getByText(/Denúncia enviada/)).toBeVisible();
    const c = calls.find((x) => x.kind === "rpc" && x.name === "report_moment");
    expect(c.body).toEqual({ p_story: U(103), p_reason: "golpe" });
  });

  test("denúncia de criança ou adolescente sem autorização: motivo próprio, enviado ao banco", async ({ page }) => {
    const calls = await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").nth(1).click();
    await page.getByRole("button", { name: "Mais opções" }).click();
    await page.getByRole("menuitem", { name: "Denunciar" }).click();
    await page.getByLabel("Criança ou adolescente sem autorização").check();
    await page.getByRole("button", { name: "Enviar denúncia" }).click();
    await expect(page.getByText(/Denúncia enviada/)).toBeVisible();
    expect(calls.find((x) => x.kind === "rpc" && x.name === "report_moment").body).toEqual({ p_story: U(103), p_reason: "menor" });
  });

  test("casa no Grátis: vê o convite para o Essencial, não o botão de criar", async ({ page }) => {
    await setup(page, "casa", "gratis");
    await page.goto("/comunidade");
    await expect(page.getByRole("link", { name: /Momentos a partir do plano Essencial/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Criar momento/ })).toHaveCount(0);
  });

  test("casa Essencial: só foto; publica e o momento vai para o banco com os campos certos", async ({ page }) => {
    const calls = await setup(page, "casa", "base", { rest: { services: [{ id: U(80), title: "Jogo de búzios" }] } });
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    const input = page.locator("#moment-file");
    await expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    await expect(page.getByText(/Premium/)).toBeVisible();
    await input.setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("x") });
    await expect(page.getByText(/disponíveis no plano Premium/)).toBeVisible();
    await input.setInputFiles(png());
    await page.getByRole("dialog", { name: "Editar momento" }).getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByAltText("Prévia do momento")).toBeVisible();
    await page.getByLabel("Legenda (opcional)").fill("Hoje tem gira!");
    await page.getByLabel(/Ligar a um serviço/).selectOption({ label: "Serviço: Jogo de búzios" });
    await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/Momento publicado/)).toBeVisible();
    const up = calls.find((x) => x.kind === "storage" && /^moments\//.test(x.name));
    expect(up.method).toBe("POST");
    expect(up.name).toMatch(new RegExp(`^moments/${ME}/[a-z0-9]+\\.(webp|jpg)$`));
    const ins = calls.find((x) => x.kind === "rest" && x.name.startsWith("stories") && x.method === "POST");
    expect(ins.body).toMatchObject({ house_id: HID, caption: "Hoje tem gira!", link_kind: "service", link_id: U(80), duration_s: null, poster_path: null });
    expect(ins.body.media_path).toMatch(new RegExp(`^${ME}/[a-z0-9]+\\.(webp|jpg)$`));
  });

  test("casa Premium: aceita vídeo no seletor", async ({ page }) => {
    await setup(page, "casa", "maximo");
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await expect(page.locator("#moment-file")).toHaveAttribute("accept", /video\/mp4/);
    await expect(page.getByText("Escolher foto ou vídeo (até 30 s)")).toBeVisible();
  });

  test("se o banco recusar (limite do dia), mostra o motivo, apaga o arquivo enviado e não publica", async ({ page }) => {
    const calls = await setup(page, "casa", "base", { rest: { stories: (body) => (body ? { status: 400, body: { code: "P0001", message: "Você chegou ao limite de 3 momento(s) por dia do seu plano." } } : []) } });
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await page.locator("#moment-file").setInputFiles(png());
    await page.getByRole("dialog", { name: "Editar momento" }).getByRole("button", { name: "Concluir" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/limite de 3 momento/).first()).toBeVisible();
    await expect.poll(() => calls.some((x) => x.kind === "storage" && x.method === "DELETE")).toBe(true);
    await expect(page.getByText(/Momento publicado/)).toHaveCount(0);
  });

  test("acessibilidade (axe) do carrossel e do visualizador, e sem rolagem horizontal no celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await expect(page.getByTestId("moment-card")).toHaveCount(2);
    await noHScroll(page);
    const a = await new AxeBuilder({ page }).include('[aria-label="Momentos das casas"]').withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(a.violations.map((x) => x.id + ": " + x.nodes.map((n) => n.target).join(","))).toEqual([]);
    await page.getByTestId("moment-card").first().click();
    await expect(page.getByTestId("moment-viewer")).toBeVisible();
    const b = await new AxeBuilder({ page }).include('[data-testid="moment-viewer"]').withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(b.violations.map((x) => x.id + ": " + x.nodes.map((n) => n.target).join(","))).toEqual([]);
  });
});

test.describe("momentos: curtir, comentar e visualizações", () => {
  const stats = { views: 12, likes: 2, comments_count: 1,
    likers: [{ user_id: U(21), name: "Ana Souza", avatar: null, at: iso(5) }, { user_id: U(22), name: "Beto Lima", avatar: null, at: iso(9) }],
    comments: [{ id: U(31), user_id: U(21), name: "Ana Souza", avatar: null, body: "Axé, que lindo! 🙏", at: iso(4) }] };
  const mine = [{ ...feed[0], owner_id: ME, name: "Minha Casa", items: [{ ...feed[0].items[0], views: 12, likes: 2, comments: 1 }] }];

  test("cliente: abrir conta uma visualização; curtir chama o banco e vira 'Descurtir'", async ({ page }) => {
    const calls = await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    await expect(v).toBeVisible();
    await v.getByRole("button", { name: "Pausar momento" }).click(); // com a máquina ocupada o tempo do momento poderia passar antes do clique
    await expect.poll(() => calls.some((x) => x.kind === "rpc" && x.name === "moment_view" && x.body.p_story === U(101))).toBe(true);
    await v.getByRole("button", { name: "Curtir", exact: true }).click();
    await expect(v.getByRole("button", { name: "Descurtir" })).toHaveAttribute("aria-pressed", "true");
    expect(calls.find((x) => x.kind === "rpc" && x.name === "moment_like").body).toEqual({ p_story: U(101), p_on: true });
    await v.getByRole("button", { name: "Descurtir" }).click();
    await expect(v.getByRole("button", { name: "Curtir", exact: true })).toBeVisible();
  });

  test("se o banco recusar a curtida, o coração volta e aparece o motivo", async ({ page }) => {
    await setup(page, "cliente", null, { rpc: { moment_like: { status: 400, body: { code: "P0001", message: "Não foi possível curtir este momento." } } } });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await page.getByTestId("moment-viewer").getByRole("button", { name: "Pausar momento" }).click();
    await page.getByTestId("moment-viewer").getByRole("button", { name: "Curtir", exact: true }).click();
    await expect(page.getByText("Não foi possível curtir este momento.")).toBeVisible();
    await expect(page.getByTestId("moment-viewer").getByRole("button", { name: "Curtir", exact: true })).toBeVisible();
  });

  test("comentar: digitar não troca de momento (setas), pausa, e enviar chama o banco e avisa que só a casa vê", async ({ page }) => {
    const calls = await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    const input = v.getByLabel("Comentar neste momento");
    await input.click();
    await input.fill("Que lindo, axé! 🙏");
    await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowRight");
    await expect(v.getByText("Gira de hoje às 19h")).toBeVisible(); // continua no mesmo momento
    await v.getByRole("button", { name: "Enviar comentário" }).click();
    await expect(page.getByText("Comentário enviado. Só a casa vê.")).toBeVisible();
    expect(calls.find((x) => x.kind === "rpc" && x.name === "moment_comment").body).toEqual({ p_story: U(101), p_body: "Que lindo, axé! 🙏" });
    await expect(input).toHaveValue("");
  });

  test("comentário recusado mostra o motivo e mantém o texto", async ({ page }) => {
    await setup(page, "cliente", null, { rpc: { moment_comment: { status: 400, body: { code: "P0001", message: "Muitos comentários hoje. Tente novamente amanhã." } } } });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const input = page.getByTestId("moment-viewer").getByLabel("Comentar neste momento");
    await input.fill("oi");
    await input.press("Enter");
    await expect(page.getByText("Muitos comentários hoje. Tente novamente amanhã.")).toBeVisible();
    await expect(input).toHaveValue("oi");
  });

  test("a casa vê o olho, o coração e os comentários com números e abre a atividade com os nomes", async ({ page }) => {
    const calls = await setup(page, "casa", "base", { rpc: { moments_feed: mine, moment_stats: stats } });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    await expect(v.getByLabel("Comentar neste momento")).toHaveCount(0); // a casa não comenta o próprio momento
    const btn = v.getByRole("button", { name: /Ver atividade: 12 visualizações, 2 curtidas, 1 comentários/ });
    await expect(btn).toBeVisible();
    await expect.poll(() => calls.some((x) => x.name === "moment_view")).toBe(false);
    await btn.click();
    const p = page.getByRole("dialog", { name: "Atividade do momento" });
    await expect(p.getByText("12 pessoas viram")).toBeVisible();
    await expect(p.getByText("Beto Lima")).toBeVisible();
    await expect(p.getByText("Axé, que lindo! 🙏")).toBeVisible();
    await p.getByRole("button", { name: "Apagar" }).click();
    await expect(p.getByText("Axé, que lindo! 🙏")).toHaveCount(0);
    expect(calls.find((x) => x.name === "moment_comment_delete").body).toEqual({ p_comment: U(31) });
  });

  test("a casa responde: 'Responder' leva ao chat com a pessoa", async ({ page }) => {
    await setup(page, "casa", "base", { rpc: { moments_feed: mine, moment_stats: stats } });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await page.getByTestId("moment-viewer").getByRole("button", { name: /Ver atividade/ }).click();
    await page.getByRole("dialog", { name: "Atividade do momento" }).getByRole("button", { name: "Responder" }).click();
    await expect(page).toHaveURL(new RegExp(`/mensagens/${U(21)}`));
  });

  test("acessibilidade (axe) do campo de comentar e da atividade da casa", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const a = await new AxeBuilder({ page }).include('[data-testid="moment-viewer"]').withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(a.violations.map((x) => x.id + ": " + x.nodes.map((n) => n.target).join(","))).toEqual([]);
    await noHScroll(page);
  });
  test("acessibilidade (axe) do painel de atividade", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await setup(page, "casa", "base", { rpc: { moments_feed: mine, moment_stats: stats } });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await page.getByTestId("moment-viewer").getByRole("button", { name: /Ver atividade/ }).click();
    await expect(page.getByRole("dialog", { name: "Atividade do momento" })).toBeVisible();
    const a = await new AxeBuilder({ page }).include('[aria-label="Atividade do momento"]').withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(a.violations.map((x) => x.id + ": " + x.nodes.map((n) => n.target).join(","))).toEqual([]);
  });
});

test.describe("momentos: limite por dia conta o publicado", () => {
  test("a vaga vem do registro de publicações (apagar não devolve): 2 publicados no Essencial = sobra 1", async ({ page }) => {
    await setup(page, "casa", "base", { rpc: { moments_published_today: 2 } });
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await expect(page.getByText(/ainda pode publicar/)).toContainText("1 momento");
  });
  test("3 publicados no Essencial: avisa o limite e trava o botão", async ({ page }) => {
    await setup(page, "casa", "base", { rpc: { moments_published_today: 3 } });
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await expect(page.getByText(/chegou ao limite de momentos de hoje/)).toBeVisible();
    await page.locator("#moment-file").setInputFiles(png());
    await page.getByRole("dialog", { name: "Editar momento" }).getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true })).toBeDisabled();
  });
});

test.describe("teclado e foco nas janelas de tela cheia (acessibilidade)", () => {
  // Tab e Shift+Tab ficam dentro da janela: quem navega por teclado ou leitor de tela não cai na página de trás.
  const foraDaJanela = async (page, nome, voltas, shift) => {
    const fora = [];
    for (let i = 0; i < voltas; i++) {
      await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
      const dentro = await page.evaluate((n) => { const d = document.querySelector(`[role=dialog][aria-label="${n}"]`); return Boolean(d && d.contains(document.activeElement)); }, nome);
      if (!dentro) fora.push(i);
    }
    return fora;
  };
  test("visualizador: o foco começa dentro, Tab e Shift+Tab não escapam, e ao fechar o foco volta ao cartão", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    const card = page.getByTestId("moment-card").first();
    await card.focus(); await page.keyboard.press("Enter");
    const v = page.getByRole("dialog", { name: "Momentos de Casa de Oxum" });
    await expect(v).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.querySelector("[data-testid=moment-viewer]")?.contains(document.activeElement)))).toBe(true);
    expect(await foraDaJanela(page, "Momentos de Casa de Oxum", 25, false)).toEqual([]);
    expect(await foraDaJanela(page, "Momentos de Casa de Oxum", 25, true)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("moment-viewer")).toHaveCount(0);
    await expect(card).toBeFocused();
  });
  test("denunciar dentro do visualizador: o foco fica preso na janela de denúncia", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await page.getByRole("button", { name: "Mais opções" }).click();
    await page.getByRole("menuitem", { name: /Denunciar/ }).click();
    const rep = page.getByRole("dialog", { name: "Denunciar momento" });
    await expect(rep).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.querySelector("[role=dialog][aria-label='Denunciar momento']")?.contains(document.activeElement)))).toBe(true);
    }
  });
  test("editor de foto: Tab e Shift+Tab não escapam da janela", async ({ page }) => {
    await setup(page, "casa", "base");
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await page.locator("#moment-file").setInputFiles(png());
    await expect(page.getByRole("dialog", { name: "Editar momento" })).toBeVisible();
    expect(await foraDaJanela(page, "Editar momento", 30, false)).toEqual([]);
    expect(await foraDaJanela(page, "Editar momento", 30, true)).toEqual([]);
  });
  test("pausa por botão (WCAG 2.2.2): o avanço automático para, o botão anuncia o estado e continua ao reativar", async ({ page }) => {
    await setup(page, "cliente", null);
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const bar = page.getByTestId("moment-progress");
    const w = async () => Number.parseFloat(await bar.evaluate((e) => e.style.width));
    await expect.poll(w).toBeGreaterThan(0);
    const pausar = page.getByRole("button", { name: "Pausar momento" });
    await expect(pausar).toHaveAttribute("aria-pressed", "false");
    await pausar.click();
    const continuar = page.getByRole("button", { name: "Continuar momento" });
    await expect(continuar).toHaveAttribute("aria-pressed", "true");
    const parado = await w();
    await page.waitForTimeout(1200);
    expect(await w()).toBe(parado);
    await continuar.click();
    await expect.poll(w).toBeGreaterThan(parado);
  });
});
