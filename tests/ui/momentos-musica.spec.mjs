// Música nos Momentos (18/11/2026): player no visualizador, escolha na publicação e biblioteca no painel do proprietário.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), CASA = U(11), HID = U(60), TRACK = U(90);
const consentsCli = [{ doc_key: "termos_cliente", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }];
const consentsCasa = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-8", accepted_at: "2026-11-01T10:00:00Z" }];
const profile = (type) => ({ id: ME, account_type: type, display_name: type === "casa" ? "Minha Casa" : "Maria", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" });
const house = { id: HID, owner_id: ME, name: "Minha Casa", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "base", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null } };
const iso = (m) => new Date(Date.now() - m * 60000).toISOString();
const item = (n, music) => ({ id: U(100 + n), kind: "image", path: `${CASA}/a${n}.jpg`, poster: null, caption: `Momento ${n}`, created_at: iso(30), expires_at: iso(-1410), duration: null, link_kind: null, link_id: null, link_title: null, music });
const group = (items) => [{ owner_id: CASA, house_id: U(61), name: "Casa de Oxum", slug: "casa-de-oxum", avatar: null, followed: true, items }];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
// 3 s de silêncio em WAV (o navegador decodifica sem depender de MP3 no ambiente de teste)
const wav = (() => { const sr = 8000, n = sr * 3, b = Buffer.alloc(44 + n); b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b; })();
const setup = async (page, type, { feed = [], catalog = [], extra = {} } = {}) => {
  const calls = await api(page, {
    rest: { profiles: profile(type), legal_consents: type === "casa" ? consentsCasa : consentsCli, houses: type === "casa" ? [house] : [], stories: [], services: [], events: [], posts: [], ...(extra.rest ?? {}) },
    rpc: { moments_feed: feed, music_catalog: catalog, moments_published_today: 0, report_client_error: true, ...(extra.rpc ?? {}) },
  });
  await page.route("**/storage/v1/object/public/moments/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/storage/v1/object/public/music/**", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: wav }));
  return calls;
};
const playing = (page) => page.evaluate(() => [...document.querySelectorAll("audio")].filter((a) => !a.paused && !a.ended).length);

test.describe("música no visualizador", () => {
  test.use({ viewport: { width: 390, height: 780 } });
  const music = { id: TRACK, title: "Brisa de Axé", author: "Ana Souza", path: "abcd1234efgh.mp3" };

  test("foto com música: mostra a faixa, toca, silencia, volta a tocar e para ao fechar", async ({ page }) => {
    await setup(page, "cliente", { feed: group([item(1, music), item(2, null)]) });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    await expect(v.getByTestId("moment-music")).toHaveText("♪ Brisa de Axé — Ana Souza");
    await expect.poll(() => playing(page)).toBe(1);
    await v.getByRole("button", { name: "Desligar o som" }).click();
    await expect.poll(() => playing(page)).toBe(0);
    await v.getByRole("button", { name: "Ligar o som" }).click();
    await expect.poll(() => playing(page)).toBe(1);
    await expect(v.getByRole("button", { name: /baixar|download/i })).toHaveCount(0);
    await page.keyboard.press("ArrowRight"); // próximo momento, sem música
    await expect(v.getByText("Momento 2")).toBeVisible();
    await expect(v.getByTestId("moment-music")).toHaveCount(0);
    await expect.poll(() => playing(page)).toBe(0);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => playing(page)).toBe(1);
    await page.keyboard.press("Escape");
    await expect(v).toHaveCount(0);
    expect(await playing(page)).toBe(0);
  });

  test("momento sem música: sem botão de som e sem áudio", async ({ page }) => {
    await setup(page, "cliente", { feed: group([item(1, null)]) });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    const v = page.getByTestId("moment-viewer");
    await expect(v.getByText("Momento 1")).toBeVisible();
    await expect(v.getByRole("button", { name: /o som/ })).toHaveCount(0);
    expect(await page.locator("audio").count()).toBe(0);
  });

  test("música com arquivo inválido (caminho hostil) é ignorada: nada é tocado", async ({ page }) => {
    await setup(page, "cliente", { feed: group([item(1, { id: TRACK, title: "<img src=x onerror=window.__xss=1>", author: "x", path: "../../etc/passwd.mp3" })]) });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await expect(page.getByTestId("moment-viewer").getByText("Momento 1")).toBeVisible();
    expect(await page.locator("audio").count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("título com HTML aparece como texto, sem executar", async ({ page }) => {
    await setup(page, "cliente", { feed: group([item(1, { ...music, title: "<b onmouseover=window.__xss=1>Oi</b>" })]) });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await expect(page.getByTestId("moment-music")).toContainText("<b onmouseover=window.__xss=1>Oi</b>");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("acessibilidade do visualizador com música", async ({ page }) => {
    await setup(page, "cliente", { feed: group([item(1, music)]) });
    await page.goto("/comunidade");
    await page.getByTestId("moment-card").first().click();
    await expect(page.getByTestId("moment-music")).toBeVisible();
    const r = await new AxeBuilder({ page }).include("[data-testid=moment-viewer]").analyze();
    expect(r.violations.map((x) => x.id)).toEqual([]);
  });
});

test.describe("escolher a música ao publicar", () => {
  test.use({ viewport: { width: 390, height: 780 } });
  const cat = [{ id: TRACK, title: "Brisa de Axé", author: "Ana Souza", path: "abcd1234efgh.mp3" }, { id: U(91), title: "Ondas", author: "Beto", path: "wxyz9876abcd.mp3" }];
  const photo = async (page) => { const b64 = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 200; c.getContext("2d").fillRect(0, 0, 300, 200); return c.toDataURL("image/png").split(",")[1]; }); return { name: "f.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") }; };
  const toPreview = async (page) => {
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await page.locator("#moment-file").setInputFiles(await photo(page));
    await page.getByRole("dialog", { name: "Editar momento" }).getByRole("button", { name: "Concluir" }).click();
  };

  test("com faixas: aparece o campo, dá para ouvir e a escolha vai junto no momento", async ({ page }) => {
    const calls = await setup(page, "casa", { catalog: cat });
    await toPreview(page);
    const sel = page.getByLabel("Música (opcional)");
    await expect(sel).toBeVisible();
    await expect(sel.locator("option")).toHaveText(["Sem música", "Brisa de Axé — Ana Souza", "Ondas — Beto"]);
    await expect(page.getByRole("button", { name: "Ouvir a música" })).toBeDisabled();
    await sel.selectOption({ label: "Ondas — Beto" });
    await page.getByRole("button", { name: "Ouvir a música" }).click();
    await expect(page.getByRole("button", { name: "Parar a música" })).toBeVisible();
    expect(await playing(page)).toBe(0); // o áudio de prévia não fica no DOM, mas toca: confere pelo botão
    await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/Momento publicado/)).toBeVisible();
    const ins = calls.find((x) => x.kind === "rest" && x.name.startsWith("stories") && x.method === "POST");
    expect(ins.body.music_id).toBe(U(91));
  });

  test("sem escolher música, vai sem música", async ({ page }) => {
    const calls = await setup(page, "casa", { catalog: cat });
    await toPreview(page);
    await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/Momento publicado/)).toBeVisible();
    expect(calls.find((x) => x.kind === "rest" && x.name.startsWith("stories") && x.method === "POST").body.music_id).toBeNull();
  });

  test("catálogo vazio (música desligada): o campo nem aparece", async ({ page }) => {
    await setup(page, "casa", { catalog: [] });
    await toPreview(page);
    await expect(page.getByAltText("Prévia do momento")).toBeVisible();
    await expect(page.getByLabel("Música (opcional)")).toHaveCount(0);
  });

  test("o banco recusa a faixa (desligada na hora): mostra o motivo e não publica", async ({ page }) => {
    await setup(page, "casa", { catalog: cat, extra: { rest: { stories: (body) => (body ? { status: 400, body: { code: "P0001", message: "A música escolhida não está disponível." } } : []) } } });
    await toPreview(page);
    await page.getByLabel("Música (opcional)").selectOption({ index: 1 });
    await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/Não foi possível publicar agora|música escolhida/).first()).toBeVisible();
    await expect(page.getByText(/Momento publicado/)).toHaveCount(0);
  });
});


test.describe("filtros do seletor de música", () => {
  test.use({ viewport: { width: 390, height: 780 } });
  const tr = (n, extra) => ({ id: U(400 + n), title: `Faixa ${n}`, author: `Autor ${n}`, path: `abcd1234ef${String(n).padStart(2, "0")}.mp3`, style: null, occasions: [], vocal: false, ...extra });
  const big = [tr(1, { title: "Parabéns Alegre", style: "pop", occasions: ["aniversario", "festa"], vocal: true }), tr(2, { title: "Brisa Calma", style: "ambiente", occasions: ["calma"] }), tr(3, { style: "pop", occasions: ["romantica"], vocal: true }), tr(4), tr(5), tr(6), tr(7, { style: "jazz", occasions: ["festa"] })];
  const photo = async (page) => { const b64 = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 200; c.getContext("2d").fillRect(0, 0, 300, 200); return c.toDataURL("image/png").split(",")[1]; }); return { name: "f.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") }; };
  const toPreview = async (page) => { await page.goto("/comunidade"); await page.getByRole("button", { name: /Criar momento/ }).click(); await page.locator("#moment-file").setInputFiles(await photo(page)); await page.getByRole("dialog", { name: "Editar momento" }).getByRole("button", { name: "Concluir" }).click(); };

  test("catálogo grande: filtros por estilo, ocasião, voz e busca; só mostra opções que existem", async ({ page }) => {
    await setup(page, "casa", { catalog: big });
    await toPreview(page);
    const f = page.getByTestId("music-filters"); await expect(f).toBeVisible();
    await expect(f.getByLabel("Estilo da música").locator("option")).toHaveText(["Todos os estilos", "Pop", "Jazz", "Ambiente"]);
    await expect(f.getByLabel("Ocasião da música").locator("option")).toHaveText(["Todas as ocasiões", "Romântica", "Festa", "Aniversário", "Calma"]);
    const sel = page.getByLabel("Música (opcional)");
    await f.getByLabel("Ocasião da música").selectOption("festa");
    await expect(sel.locator("option")).toHaveText(["Sem música", "Parabéns Alegre — Autor 1 (com voz)", "Faixa 7 — Autor 7"]);
    await f.getByLabel("Voz").selectOption("sem");
    await expect(sel.locator("option")).toHaveText(["Sem música", "Faixa 7 — Autor 7"]);
    await f.getByLabel("Voz").selectOption("");
    await f.getByLabel("Ocasião da música").selectOption("");
    await f.getByLabel("Estilo da música").selectOption("pop");
    await expect(sel.locator("option")).toHaveCount(3);
    await f.getByLabel("Estilo da música").selectOption("");
    await f.getByLabel("Buscar música").fill("PARABENS");
    await expect(sel.locator("option")).toHaveText(["Sem música", "Parabéns Alegre — Autor 1 (com voz)"]);
    await f.getByLabel("Buscar música").fill("zzz");
    await expect(page.getByText("Nenhuma música com esses filtros.")).toBeVisible();
    await noHScroll(page);
  });

  test("janela de publicar com os filtros de música: sem violações de acessibilidade (claro e escuro)", async ({ page }) => {
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await setup(page, "casa", { catalog: big });
      await toPreview(page);
      await expect(page.getByTestId("music-filters")).toBeVisible();
      const r = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes[0].target.join(" ")}`)).toEqual([]);
      await page.goto("/");
    }
  });

  test("a faixa já escolhida continua na lista mesmo se o filtro a esconder; vai no momento", async ({ page }) => {
    const calls = await setup(page, "casa", { catalog: big });
    await toPreview(page);
    const sel = page.getByLabel("Música (opcional)");
    await sel.selectOption({ label: "Brisa Calma — Autor 2" });
    await page.getByLabel("Estilo da música").selectOption("jazz");
    await expect(sel.locator("option")).toHaveText(["Sem música", "Brisa Calma — Autor 2", "Faixa 7 — Autor 7"]);
    await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/Momento publicado/)).toBeVisible();
    expect(calls.find((x) => x.kind === "rest" && x.name.startsWith("stories") && x.method === "POST").body.music_id).toBe(U(402));
  });

  test("catálogo pequeno: sem filtros, só a lista", async ({ page }) => {
    await setup(page, "casa", { catalog: big.slice(0, 3) });
    await toPreview(page);
    await expect(page.getByLabel("Música (opcional)")).toBeVisible();
    await expect(page.getByTestId("music-filters")).toHaveCount(0);
  });
});

test.describe("créditos de áudio", () => {
  test.use({ viewport: { width: 390, height: 780 } });
  const credits = [
    { title: "Brisa", author: "Ana", source_url: "https://ende.app/x", license_kind: "cc_by", license_url: "https://creativecommons.org/licenses/by/4.0/", license_note: null },
    { title: "<img src=x onerror=window.__xss=1>", author: "Beto", source_url: "javascript:window.__xss=1", license_kind: null, license_url: "http://x.com", license_note: "Nota <b>x</b>" },
  ];
  test("lista título, autor, licença e fonte com links seguros; texto hostil não executa; sem violações", async ({ page }) => {
    await setup(page, "cliente", { extra: { rpc: { music_credits: credits } } });
    await page.goto("/creditos-de-audio");
    await expect(page.getByRole("heading", { name: "Créditos de áudio" })).toBeVisible();
    const list = page.getByTestId("audio-credits");
    await expect(list.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    await expect(list.getByRole("link", { name: "Fonte" })).toHaveCount(1);
    await expect(list.getByRole("link", { name: "Fonte" })).toHaveAttribute("href", "https://ende.app/x");
    await expect(list).toContainText("<img src=x onerror=window.__xss=1>");
    await expect(list).toContainText("Nota <b>x</b>");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await noHScroll(page);
    const r = await new AxeBuilder({ page }).include("[data-testid=audio-credits]").analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
  test("sem músicas: mensagem clara; e a tela de Termos aponta para os créditos", async ({ page }) => {
    await setup(page, "cliente", { extra: { rpc: { music_credits: [] } } });
    await page.goto("/creditos-de-audio");
    await expect(page.getByText("Nenhuma música disponível no momento.")).toBeVisible();
    await page.goto("/termos");
    await page.getByRole("link", { name: "Ver os créditos" }).click();
    await expect(page).toHaveURL(/creditos-de-audio/);
  });
});

test.describe("biblioteca de músicas no painel", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  const track = (n, extra = {}) => ({ id: U(200 + n), title: `Faixa ${n}`, author: "Autora", source_url: "https://pixabay.com/music/x", license_note: "Pixabay Content License", license_date: "2026-11-10", path: `abcd1234efg${n}.mp3`, size_bytes: 3145728, active: true, created_at: "2026-11-17T10:00:00Z", uses: 2, ...extra });
  const state = (extra = {}) => ({ enabled: false, max_total_bytes: 524288000, total_bytes: 6291456, max_count: 300, tracks: [track(1), track(2, { active: false, uses: 0 })], ...extra });
  const admin = (extra = {}) => ({ rest: { profiles: { ...profile("pessoa"), display_name: "Admin" }, legal_consents: consentsCli, platform_settings: [] }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_moment_reports: [], admin_music_list: state(), admin_music_set_enabled: null, admin_music_set_active: null, admin_music_add: U(300), admin_music_update: null, admin_music_meta: null, admin_music_delete: "abcd1234efg2.mp3", ...extra } });
  const open = async (page, a = admin()) => { const calls = await api(page, a); await page.route("**/storage/v1/object/public/music/**", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: wav })); await page.goto("/admin?s=config"); await expect(page.getByRole("heading", { name: "Biblioteca de músicas" })).toBeVisible(); return calls; };
  const mp3 = (name = "faixa.mp3", size = 2048) => ({ name, mimeType: "audio/mpeg", buffer: Buffer.alloc(size, 1) });

  test("mostra o estado, o uso de espaço e as faixas; sem rolagem lateral e sem violações de acessibilidade", async ({ page }) => {
    await open(page);
    await expect(page.getByText("Música nos momentos:")).toContainText("desligada");
    await expect(page.getByText("2 de 300 faixas")).toBeVisible();
    await expect(page.getByText("6.0 MB de 500 MB usados")).toBeVisible();
    await expect(page.getByText("Faixa 1")).toBeVisible();
    await expect(page.getByText(/usada em 2 momentos/)).toBeVisible();
    await expect(page.getByRole("switch", { name: "Faixa Faixa 2 ligada" })).not.toBeChecked();
    await noHScroll(page);
    const r = await new AxeBuilder({ page }).include("[data-testid=music-library]").analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`)).toEqual([]);
  });

  test("interruptor geral e interruptor de faixa chamam o banco", async ({ page }) => {
    const calls = await open(page);
    await page.getByRole("button", { name: "Ligar", exact: true }).click();
    await expect.poll(() => calls.find((c) => c.name === "admin_music_set_enabled")?.body).toEqual({ p_on: true });
    await page.getByRole("switch", { name: "Faixa Faixa 2 ligada" }).click();
    await expect.poll(() => calls.find((c) => c.name === "admin_music_set_active")?.body).toEqual({ p_id: U(202), p_on: true });
  });

  test("cadastrar: envia o arquivo com nome seguro e registra título, autor, fonte, licença e tamanho", async ({ page }) => {
    const calls = await open(page);
    await expect(page.getByRole("button", { name: "Cadastrar música" })).toBeDisabled();
    await page.locator("input[type=file]").setInputFiles(mp3("minha faixa (1).mp3", 4096));
    await page.getByLabel("Título", { exact: true }).first().fill("  Brisa nova ");
    await page.getByLabel("Autor(a)").fill("Ana");
    await page.getByLabel(/Link de onde baixou/).fill("https://pixabay.com/music/abc");
    await page.getByLabel(/Observação da licença/).fill("Pixabay Content License");
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText(/Música cadastrada/)).toBeVisible();
    const up = calls.find((c) => c.kind === "storage" && c.method === "POST");
    expect(up.name).toMatch(/^music\/[a-z0-9]{20}\.mp3$/);
    const add = calls.find((c) => c.name === "admin_music_add").body;
    expect(add).toMatchObject({ p_title: "Brisa nova", p_author: "Ana", p_source: "https://pixabay.com/music/abc", p_license: "Pixabay Content License", p_size: 4096 });
    expect(add.p_path).toMatch(/^[a-z0-9]{20}\.mp3$/);
  });

  test("recusas antes de enviar: formato errado, grande demais, link sem https", async ({ page }) => {
    const calls = await open(page);
    const fill = async () => { await page.getByLabel("Título", { exact: true }).first().fill("T"); await page.getByLabel("Autor(a)").fill("A"); };
    await page.locator("input[type=file]").setInputFiles({ name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.alloc(100, 1) });
    await fill(); await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText("Use um arquivo MP3, M4A ou OGG.").first()).toBeVisible();
    await page.locator("input[type=file]").setInputFiles({ name: "grande.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(8 * 1024 * 1024 + 1, 1) });
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText(/passa de 8 MB/).first()).toBeVisible();
    await page.locator("input[type=file]").setInputFiles(mp3());
    await page.getByLabel(/Link de onde baixou/).fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText(/começar com https/).first()).toBeVisible();
    expect(calls.some((c) => c.kind === "storage" || c.name === "admin_music_add")).toBe(false);
  });

  test("se o banco recusar o cadastro (espaço/limite), o arquivo enviado é apagado e o motivo aparece", async ({ page }) => {
    const calls = await open(page, admin({ admin_music_add: { status: 400, body: { code: "P0001", message: "O espaço reservado para músicas (500 MB) acabou. Apague faixas que não usa mais." } } }));
    await page.locator("input[type=file]").setInputFiles(mp3());
    await page.getByLabel("Título", { exact: true }).first().fill("T"); await page.getByLabel("Autor(a)").fill("A");
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText(/espaço reservado/).first()).toBeVisible();
    await expect.poll(() => calls.some((c) => c.kind === "storage" && c.method === "DELETE")).toBe(true);
  });

  test("editar salva; apagar pede confirmação e remove também o arquivo", async ({ page }) => {
    const calls = await open(page);
    await page.getByRole("button", { name: "Editar" }).first().click();
    await page.getByRole("listitem").filter({ hasText: "Faixa 1" }).getByRole("textbox", { name: "Título" }).fill("Título novo");
    await page.getByTestId("music-library").getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Faixa atualizada.")).toBeVisible();
    expect(calls.find((c) => c.name === "admin_music_update").body).toMatchObject({ p_id: U(201), p_title: "Título novo" });
    await page.getByRole("button", { name: "Apagar" }).nth(1).click();
    expect(calls.some((c) => c.name === "admin_music_delete")).toBe(false); // primeiro toque só pede confirmação
    await page.getByRole("button", { name: "Confirmar: apagar" }).click();
    await expect(page.getByText("Faixa apagada.")).toBeVisible();
    expect(calls.find((c) => c.name === "admin_music_delete").body).toEqual({ p_id: U(202) });
    await expect.poll(() => calls.some((c) => c.kind === "storage" && c.method === "DELETE" && c.body?.prefixes?.includes("abcd1234efg2.mp3"))).toBe(true);
  });


  test("cadastrar e editar: estilo, ocasiões, voz e licença vão para o banco; mais de 5 ocasiões não deixa marcar", async ({ page }) => {
    const calls = await open(page);
    await page.locator("input[type=file]").setInputFiles(mp3());
    await page.getByLabel("Título", { exact: true }).first().fill("Parabéns");
    await page.getByLabel("Autor(a)").fill("Ana");
    const card = page.getByTestId("music-library");
    const add = card.locator("div.border-dashed");
    await add.getByLabel("Estilo da faixa").selectOption("pop");
    await add.getByLabel("Tipo de licença").selectOption("cc_by");
    await add.getByLabel("Link da licença (https://…)").fill("https://creativecommons.org/licenses/by/4.0/");
    await add.getByLabel("Tem voz cantada").check();
    for (const o of ["Romântica", "Festa", "Aniversário", "Cerimônia", "Calma"]) await add.getByLabel(o, { exact: true }).check({ force: true });
    await add.getByLabel("Passeio", { exact: true }).click({ force: true });
    await expect(add.getByLabel("Passeio", { exact: true })).not.toBeChecked(); // o 6º não entra
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText(/Música cadastrada/)).toBeVisible();
    const meta = calls.find((c) => c.name === "admin_music_meta").body;
    expect(meta).toEqual({ p_id: U(300), p_style: "pop", p_occasions: ["romantica", "festa", "aniversario", "cerimonia", "calma"], p_vocal: true, p_license_kind: "cc_by", p_license_url: "https://creativecommons.org/licenses/by/4.0/" });
  });

  test("link de licença sem https é recusado antes de enviar", async ({ page }) => {
    const calls = await open(page);
    await page.locator("input[type=file]").setInputFiles(mp3());
    await page.getByLabel("Título", { exact: true }).first().fill("T"); await page.getByLabel("Autor(a)").fill("A");
    await page.getByLabel("Link da licença (https://…)").first().fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText("O link da licença precisa começar com https://").first()).toBeVisible();
    expect(calls.some((c) => c.kind === "storage" || c.name === "admin_music_add")).toBe(false);
  });

  test("a lista mostra estilo, ocasiões e voz; editar abre os campos já preenchidos", async ({ page }) => {
    const calls = await open(page, admin({ admin_music_list: state({ tracks: [track(1, { style: "pop", occasions: ["festa"], vocal: true, license_kind: "cc0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" })] }) }));
    await expect(page.getByText("Pop · Festa · Com voz")).toBeVisible();
    await page.getByRole("button", { name: "Editar" }).click();
    const li = page.getByRole("listitem").filter({ hasText: "Faixa 1" });
    await expect(li.getByLabel("Estilo da faixa")).toHaveValue("pop");
    await expect(li.getByLabel("Tipo de licença")).toHaveValue("cc0");
    await expect(li.getByLabel("Tem voz cantada")).toBeChecked();
    await li.getByLabel("Estilo da faixa").selectOption("jazz");
    await li.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Faixa atualizada.")).toBeVisible();
    expect(calls.find((c) => c.name === "admin_music_meta").body).toMatchObject({ p_id: U(201), p_style: "jazz", p_vocal: true, p_license_kind: "cc0" });
  });


  test("ao escolher o MP3, título e autor vêm do próprio arquivo (sem apagar o que já foi digitado)", async ({ page }) => {
    await open(page);
    const ss = (n) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
    const fr = (id, text) => { const body = [3, ...Buffer.from(text, "utf8")]; return [...Buffer.from(id), ...ss(body.length), 0, 0, ...body]; };
    const frames = [...fr("TIT2", "Parabéns Alegre"), ...fr("TPE1", "Sascha Ende")];
    const buffer = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, ...ss(frames.length)]), Buffer.from(frames), Buffer.alloc(2048, 1)]);
    await page.locator("input[type=file]").setInputFiles({ name: "faixa-123.mp3", mimeType: "audio/mpeg", buffer });
    await expect(page.getByLabel("Título", { exact: true }).first()).toHaveValue("Parabéns Alegre");
    await expect(page.getByLabel("Autor(a)")).toHaveValue("Sascha Ende");
    await page.getByLabel("Título", { exact: true }).first().fill("Meu título");
    await page.locator("input[type=file]").setInputFiles({ name: "outra.mp3", mimeType: "audio/mpeg", buffer });
    await expect(page.getByLabel("Título", { exact: true }).first()).toHaveValue("Meu título");
  });

  const id3 = (frames) => { const ss = (n) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]; const body = frames.flat(); return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, ...ss(body.length)]), Buffer.from(body), Buffer.alloc(2048, 1)]); };
  const tf = (id, text) => { const body = [3, ...Buffer.from(text, "utf8")]; const n = body.length; return [...Buffer.from(id), (n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f, 0, 0, ...body]; };
  const cm = (text) => { const body = [3, ...Buffer.from("eng"), 0, ...Buffer.from(text, "utf8")]; const n = body.length; return [...Buffer.from("COMM"), (n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f, 0, 0, ...body]; };
  const wx = (url) => { const body = [0, 0, ...Buffer.from(url, "latin1")]; const n = body.length; return [...Buffer.from("WXXX"), (n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f, 0, 0, ...body]; };

  test("MP3 do Suno: sugere licença Outra, observação com a data e dia da conferência; nada é sobrescrito", async ({ page }) => {
    await open(page);
    const buffer = id3([tf("TIT2", "Que a Luz"), tf("TPE1", "gusborba80"), cm("made with suno; created=2026-11-20T00:28:22Z; id=x")]);
    await page.locator("input[type=file]").setInputFiles({ name: "suno.mp3", mimeType: "audio/mpeg", buffer });
    await expect(page.getByLabel("Tipo de licença").first()).toHaveValue("outra");
    await expect(page.getByLabel(/Observação da licença/)).toHaveValue("Criada na Suno em 19/11/2026");
    await expect(page.getByLabel("Data da conferência da licença")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await page.getByLabel(/Observação da licença/).fill("Criada por Gustavo na Suno (plano Pro), em 19/11/2026");
    await page.locator("input[type=file]").setInputFiles({ name: "suno2.mp3", mimeType: "audio/mpeg", buffer });
    await expect(page.getByLabel(/Observação da licença/)).toHaveValue("Criada por Gustavo na Suno (plano Pro), em 19/11/2026");
  });

  test("MP3 do ENDE: sugere fonte e CC BY 4.0; licença não comercial só avisa e não sugere", async ({ page }) => {
    await open(page);
    await page.locator("input[type=file]").setInputFiles({ name: "ende.mp3", mimeType: "audio/mpeg", buffer: id3([tf("TIT2", "Brisa"), tf("TCOP", "CC BY 4.0"), wx("https://ende.app/pt/music/brisa/")]) });
    await expect(page.getByLabel("Tipo de licença").first()).toHaveValue("cc_by");
    await expect(page.getByLabel(/Link de onde baixou/)).toHaveValue("https://ende.app/pt/music/brisa/");
    await page.reload(); // painel limpo
    await page.locator("input[type=file]").setInputFiles({ name: "nc.mp3", mimeType: "audio/mpeg", buffer: id3([tf("TIT2", "Funky"), tf("TCOP", "CC BY-NC 3.0")]) });
    await expect(page.getByText(/não serve para o app/).first()).toBeVisible();
    await expect(page.getByLabel("Tipo de licença").first()).toHaveValue("");
  });

  test("cadastrar com a música desligada avisa que ela só aparece quando for ligada", async ({ page }) => {
    await open(page);
    await page.locator("input[type=file]").setInputFiles(mp3());
    await page.getByLabel("Título", { exact: true }).first().fill("T"); await page.getByLabel("Autor(a)").fill("A");
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText("Música cadastrada. Ela só aparece para as casas quando a música estiver ligada.")).toBeVisible();
  });
  test("cadastrar com a música ligada diz que já está disponível", async ({ page }) => {
    await open(page, admin({ admin_music_list: state({ enabled: true }) }));
    await page.locator("input[type=file]").setInputFiles(mp3());
    await page.getByLabel("Título", { exact: true }).first().fill("T"); await page.getByLabel("Autor(a)").fill("A");
    await page.getByRole("button", { name: "Cadastrar música" }).click();
    await expect(page.getByText("Música cadastrada e já disponível para as casas.")).toBeVisible();
  });

  test("faixa criada no Suno (tipo Outra com observação) não gera alerta de licença", async ({ page }) => {
    await open(page, admin({ admin_music_list: state({ tracks: [track(1, { license_kind: "outra", license_note: "Criada por Gustavo na Suno (plano Pro), em 19/11/2026", license_url: null, source_url: null })] }) }));
    await expect(page.getByTestId("license-alert")).toHaveCount(0);
  });

  test("MP3 sem etiqueta: campos ficam vazios, sem erro", async ({ page }) => {
    await open(page);
    await page.locator("input[type=file]").setInputFiles(mp3("sem-tag.mp3", 3000));
    await expect(page.getByLabel("Título", { exact: true }).first()).toHaveValue("");
    await expect(page.getByLabel("Autor(a)")).toHaveValue("");
  });

  test("faixa ligada com licença incompleta: alerta no topo e aviso na faixa; completa, some", async ({ page }) => {
    await open(page, admin({ admin_music_list: state({ tracks: [track(1, { license_kind: "cc_by", license_url: "https://creativecommons.org/licenses/by/4.0/" }), track(2, { active: true, license_date: null })] }) }));
    await expect(page.getByTestId("license-alert")).toContainText("1 faixa ligada está com a licença incompleta");
    await expect(page.getByText("Licença incompleta: falta tipo de licença, link da licença, data da conferência.")).toHaveCount(1);
    await expect(page.getByText(/Licença incompleta:/)).toHaveCount(1); // a faixa 1 está completa
  });
  test("tudo completo: sem alerta", async ({ page }) => {
    await open(page, admin({ admin_music_list: state({ tracks: [track(1, { license_kind: "cc0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" })] }) }));
    await expect(page.getByTestId("license-alert")).toHaveCount(0);
  });

  test("texto hostil nos campos da faixa aparece como texto", async ({ page }) => {
    await open(page, admin({ admin_music_list: state({ tracks: [track(1, { title: "<img src=x onerror=window.__xss=1>", license_note: "<script>window.__xss=1</script>", source_url: "javascript:window.__xss=1" })] }) }));
    await expect(page.getByText("<img src=x onerror=window.__xss=1>")).toBeVisible();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("quem não é o dono não vê a biblioteca", async ({ page }) => {
    await api(page, { rest: { profiles: { ...profile("pessoa"), display_name: "Moderadora" }, legal_consents: consentsCli, platform_settings: [] }, rpc: { is_admin: true, admin_my_access: { admin: true, owner: false, perms: ["moderacao"] }, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_moment_reports: [] } });
    await page.goto("/admin?s=config");
    await expect(page.getByRole("heading", { name: /Denúncias de momentos/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Biblioteca de músicas" })).toHaveCount(0);
  });
});
