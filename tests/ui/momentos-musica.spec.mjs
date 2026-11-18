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

test.describe("biblioteca de músicas no painel", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  const track = (n, extra = {}) => ({ id: U(200 + n), title: `Faixa ${n}`, author: "Autora", source_url: "https://pixabay.com/music/x", license_note: "Pixabay Content License", license_date: "2026-11-10", path: `abcd1234efg${n}.mp3`, size_bytes: 3145728, active: true, created_at: "2026-11-17T10:00:00Z", uses: 2, ...extra });
  const state = (extra = {}) => ({ enabled: false, max_total_bytes: 524288000, total_bytes: 6291456, max_count: 300, tracks: [track(1), track(2, { active: false, uses: 0 })], ...extra });
  const admin = (extra = {}) => ({ rest: { profiles: { ...profile("pessoa"), display_name: "Admin" }, legal_consents: consentsCli, platform_settings: [] }, rpc: { is_admin: true, admin_pending_center: { total: 0, overdue: 0, counts: {}, items: [] }, admin_health: null, admin_moment_reports: [], admin_music_list: state(), admin_music_set_enabled: null, admin_music_set_active: null, admin_music_add: U(300), admin_music_update: null, admin_music_delete: "abcd1234efg2.mp3", ...extra } });
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
