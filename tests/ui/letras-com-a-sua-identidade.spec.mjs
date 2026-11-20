import { test, expect } from "@playwright/test";
import { api, U, noHScroll } from "./_api.mjs";

const OWNER = U(1), HID = U(60);
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }];
const house = (plan) => ({ id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan, created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const setup = (page, plan, list = []) => api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house(plan)], posts: (body) => (body ? { id: U(900), created_at: "2026-11-17T10:00:00Z" } : list) }, rpc: { post_like_counts: [] } });
async function photo(page, color) {
  const url = await page.evaluate((c) => { const k = document.createElement("canvas"); k.width = 200; k.height = 120; const x = k.getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 200, 120); return k.toDataURL("image/png"); }, color);
  return { name: "foto.png", mimeType: "image/png", buffer: Buffer.from(url.split(",")[1], "base64") };
}
const radio = (page, name) => page.getByRole("radio", { name });
const inserts = (calls) => calls.filter((c) => c.kind === "rest" && c.name.startsWith("posts") && c.body && !Array.isArray(c.body)).map((c) => c.body);
const row = (o) => ({ id: U(500), house_id: HID, kind: "geral", content: "Axé a todos", image_url: null, card_style: null, card_image_path: null, card_scrim: 55, card_font: null, card_size: null, card_color: null, card_align: null, card_pos: null, card_bold: false, card_italic: false, created_at: "2026-11-17T10:00:00Z", houses: { owner_id: OWNER }, post_likes: [], post_comments: [], ...o });
const OK_PATH = `${OWNER}/1700000000000-abc123.webp`;

test.describe("letras com a sua identidade (app inteiro)", () => {
  test("escolhe fonte, tamanho, cor, alinhamento, posição e negrito; a prévia muda ao vivo e o que vai para o banco é só a escolha", async ({ page }) => {
    const calls = await setup(page, "intermediario");
    await page.goto("/comunidade");
    await page.getByLabel("Texto da publicação").fill("Hoje tem gira. Axé!");
    await expect(page.getByTestId("letters-picker")).toHaveCount(0); // card normal: sem letras
    await radio(page, "Imagem no card todo").click();
    await expect(page.getByTestId("letters-picker")).toBeVisible(); // aparece assim que escolhe o card com imagem, mesmo antes da foto
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#ffffff"));
    const prev = page.getByTestId("card-preview");
    await expect(page.getByTestId("letters-picker")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Letras com a sua identidade/ })).toHaveCount(0);
    await expect(page.getByText("Letras com a sua identidade").first()).toBeVisible();
    const txt = prev.locator("p");
    await expect(txt).not.toHaveAttribute("data-letters", "1"); // sem escolha: igual ao card de antes
    const scrimBefore = await prev.locator("div[aria-hidden]").evaluate((e) => getComputedStyle(e).backgroundColor);
    await radio(page, "Ritual").click();
    await radio(page, "Grande").click();
    await radio(page, "Dourado").click();
    await radio(page, "Centralizado").click();
    await radio(page, "No meio").click();
    await page.getByRole("button", { name: "Negrito" }).click();
    await expect(txt).toHaveAttribute("data-letters", "1");
    await expect(txt).toHaveCSS("font-family", /Cinzel/);
    await expect(txt).toHaveCSS("color", "rgb(245, 208, 111)");
    await expect(txt).toHaveCSS("font-weight", "700");
    await expect(txt).toHaveCSS("text-align", "center");
    await expect(txt).toHaveCSS("font-size", `${Math.round(26 * 0.92 * 10) / 10}px`);
    await expect(prev.locator('[data-card="total"]')).toHaveClass(/items-center/);
    const scrimAfter = await prev.locator("div[aria-hidden]").evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(scrimAfter).not.toBe(""); expect(scrimBefore).not.toBe("");
    await noHScroll(page);
    await page.getByLabel(/Tenho o direito de usar esta imagem/).check();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect.poll(() => inserts(calls).length).toBe(1);
    const r = inserts(calls)[0];
    expect(r).toMatchObject({ card_style: "total", card_font: "ritual", card_size: "g", card_color: "dourado", card_align: "centro", card_pos: "meio", card_bold: true, card_italic: false });
    expect(Object.keys(r).filter((k) => /css|style_|font_family|hex/i.test(k))).toEqual([]); // nada de estilo escrito à mão
    const { card_image_path: _ignorado, ...semCaminho } = r; // o nome do arquivo leva sufixo aleatório (pode conter "px" por acaso)
    expect(JSON.stringify(semCaminho)).not.toMatch(/#F5D06F|Cinzel|px/i); // só ids da lista, nunca valores de CSS
  });

  test("trocar para o card parcial: só cores escuras, sem posição, cor clara escolhida cai; papel claro sob o texto", async ({ page }) => {
    const calls = await setup(page, "maximo");
    await page.goto("/comunidade");
    await page.getByLabel("Texto da publicação").fill("Mensagem do dia");
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#808080"));
    await radio(page, "Dourado").click();
    await radio(page, "Elegante").click();
    await expect(radio(page, "Preto")).toHaveCount(0); // cor escura não existe sobre a foto
    await radio(page, "Imagem em parte do card").click();
    await expect(radio(page, "Dourado")).toHaveCount(0);
    await expect(radio(page, "Vinho")).toBeVisible();
    await expect(radio(page, "No meio")).toHaveCount(0); // posição só no card todo
    await expect(radio(page, "Elegante")).toHaveAttribute("aria-checked", "true"); // o que combina fica
    await radio(page, "Vinho").click();
    const txt = page.getByTestId("card-preview").locator('[data-letters="1"]');
    await expect(txt).toHaveCSS("color", "rgb(122, 31, 61)");
    await expect(txt).toHaveCSS("background-color", "rgb(251, 247, 238)"); // papel fixo: lê bem no tema claro e no escuro
    await page.getByLabel(/Tenho o direito/).check();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect.poll(() => inserts(calls).length).toBe(1);
    expect(inserts(calls)[0]).toMatchObject({ card_style: "parcial", card_font: "elegante", card_color: "vinho", card_pos: null });
  });

  test("Voltar ao padrão limpa tudo; clicar de novo na escolha desmarca", async ({ page }) => {
    await setup(page, "maximo");
    await page.goto("/comunidade");
    await page.getByLabel("Texto da publicação").fill("Texto");
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#202020"));
    await radio(page, "Manuscrita").click();
    await expect(radio(page, "Manuscrita")).toHaveAttribute("aria-checked", "true");
    await radio(page, "Manuscrita").click();
    await expect(radio(page, "Manuscrita")).toHaveAttribute("aria-checked", "false");
    await radio(page, "Moderna").click(); await page.getByRole("button", { name: "Itálico" }).click();
    await expect(page.getByRole("button", { name: "Itálico" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Voltar ao padrão/ }).click();
    await expect(page.getByTestId("card-preview").locator("p")).not.toHaveAttribute("data-letters", "1");
    await expect(page.getByRole("button", { name: /Voltar ao padrão/ })).toHaveCount(0);
  });

  test("feed: post com letras chega desenhado igual; linha do banco adulterada cai no padrão sem quebrar", async ({ page }) => {
    await setup(page, "maximo", [
      row({ id: U(501), content: "Post bonito", card_style: "total", card_image_path: OK_PATH, card_font: "manuscrita", card_size: "m", card_color: "rosa", card_pos: "topo", card_align: "dir", card_italic: true }),
      row({ id: U(502), content: "Post adulterado", card_style: "parcial", card_image_path: OK_PATH, card_font: "x;background:url(http://a)", card_color: "#ff0000", card_pos: "topo", card_size: "gigante" }),
      row({ id: U(503), content: "Post sem letras", card_style: "total", card_image_path: OK_PATH }),
    ]);
    await page.goto("/comunidade");
    const a = page.locator(`#post-${U(501)} [data-letters="1"]`);
    await expect(a).toHaveCSS("font-family", /Dancing Script/);
    await expect(a).toHaveCSS("color", "rgb(255, 211, 221)");
    await expect(a).toHaveCSS("font-style", "italic");
    await expect(a).toHaveCSS("text-align", "right");
    await expect(page.locator(`#post-${U(501)} [data-card="total"]`)).toHaveClass(/items-start/);
    await expect(page.locator(`#post-${U(502)} [data-card="parcial"]`)).toBeVisible();
    await expect(page.locator(`#post-${U(502)} [data-letters]`)).toHaveCount(0); // tudo inválido: volta ao padrão
    await expect(page.locator(`#post-${U(503)} [data-card="total"]`)).toBeVisible();
    await expect(page.locator(`#post-${U(503)} [data-letters]`)).toHaveCount(0);
  });

  test("celular: o painel de letras cabe na tela e os alvos de toque têm 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page, "maximo");
    await page.goto("/comunidade");
    await page.getByLabel("Texto da publicação").fill("Texto");
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#303030"));
    await expect(page.getByTestId("letters-picker")).toBeVisible();
    await noHScroll(page);
    for (const n of ["Ritual", "Dourado", "No meio", "Negrito"]) {
      const el = n === "Negrito" ? page.getByRole("button", { name: n }) : radio(page, n);
      const box = await el.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(43);
    }
  });
});
