import { test, expect } from "@playwright/test";
import { api, U, noHScroll, abrirEditor } from "./_api.mjs";

const OWNER = U(1), HID = U(60);
const profile = { id: OWNER, account_type: "casa", display_name: "Casa Axé", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-11", accepted_at: "2026-11-01T10:00:00Z" }];
const house = (plan) => ({ id: HID, owner_id: OWNER, name: "Casa Axé", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan, created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" } });
const setup = (page, plan, extra = {}) => api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house(plan)], posts: (body) => (body ? { id: U(900), created_at: "2026-11-17T10:00:00Z" } : (extra.list ?? [])), ...(extra.rest ?? {}) }, rpc: extra.rpc ?? {}, storageOk: extra.storageOk });

/** Foto de teste feita na hora: cor lisa (clara ou escura) em PNG. */
async function photo(page, color) {
  const url = await page.evaluate((c) => { const k = document.createElement("canvas"); k.width = 200; k.height = 120; const x = k.getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 200, 120); return k.toDataURL("image/png"); }, color);
  return { name: "foto.png", mimeType: "image/png", buffer: Buffer.from(url.split(",")[1], "base64") };
}
const radio = (page, name) => page.getByRole("radio", { name: new RegExp(name) });
const inserts = (calls) => calls.filter((c) => c.kind === "rest" && c.name.startsWith("posts") && c.body && !Array.isArray(c.body) ? true : false).map((c) => c.body);

test.describe("posts com a cara da sua casa (app inteiro)", () => {
  test("Profissional: 3 opções, prévia ao vivo, confirma direito, envia foto e publica com os campos certos", async ({ page }) => {
    const calls = await setup(page, "intermediario");
    await page.goto("/comunidade");
    await abrirEditor(page);
    const area = page.getByLabel("Texto da publicação");
    await expect(radio(page, "Card normal")).toBeEnabled();
    await expect(radio(page, "Imagem no card todo")).toBeEnabled();
    await expect(radio(page, "Imagem em parte do card")).toBeEnabled();
    await area.fill("Hoje tem gira de abertura. Axé!");
    await radio(page, "Imagem no card todo").click();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText("Escolha a imagem do card.")).toBeVisible();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#ffffff"));
    const prev = page.getByTestId("card-preview");
    await expect(prev).toContainText("Hoje tem gira de abertura. Axé!");
    await expect(prev.locator('[data-card="total"]')).toBeVisible();
    await area.fill("Hoje tem gira de abertura. Axé! Venha.");
    await expect(prev).toContainText("Venha."); // prévia acompanha o texto
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText("Confirme que você tem o direito de usar a imagem.")).toBeVisible();
    await page.getByLabel(/Tenho o direito de usar esta imagem/).check();
    await radio(page, "Imagem em parte do card").click();
    await expect(prev.locator('[data-card="parcial"]')).toBeVisible();
    await radio(page, "Imagem no card todo").click();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect.poll(() => calls.filter((c) => c.kind === "storage").length).toBe(1);
    const up = calls.find((c) => c.kind === "storage");
    expect(up.method).toBe("POST");
    expect(up.name).toMatch(new RegExp(`^post-images/${OWNER}/\\d+-[a-z0-9]+\\.(webp|jpg)$`));
    await expect.poll(() => inserts(calls).length).toBe(1);
    const row = inserts(calls)[0];
    expect(row).toMatchObject({ house_id: HID, kind: "geral", content: "Hoje tem gira de abertura. Axé! Venha.", card_style: "total", card_rights_ack: true, image_url: null });
    expect(row.card_image_path).toBe(up.name.replace("post-images/", ""));
    expect(row.card_scrim).toBeGreaterThanOrEqual(54); // foto branca: véu forte
    await expect(page.getByText("Publicação enviada.")).toBeVisible();
    await expect(area).toHaveCount(0); // o editor fecha ao publicar
    await expect(page.getByTestId("card-preview")).toHaveCount(0);
    await abrirEditor(page);
    await expect(area).toHaveValue(""); // reabrindo: campo limpo e de volta ao card normal
    await expect(radio(page, "Card normal")).toHaveAttribute("aria-checked", "true");
  });

  test("foto escura pede véu leve (35 %); foto clara pede véu forte", async ({ page }) => {
    const calls = await setup(page, "maximo");
    await page.goto("/comunidade");
    await abrirEditor(page);
    await page.getByLabel("Texto da publicação").fill("Texto");
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#101010"));
    await expect(page.getByTestId("card-preview")).toBeVisible();
    await page.getByLabel(/Tenho o direito/).check();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect.poll(() => inserts(calls).length).toBe(1);
    expect(inserts(calls)[0].card_scrim).toBe(35);
  });

  test("Essencial: opções de estilo com cadeado e caminho para os planos; card normal continua igual", async ({ page }) => {
    const calls = await setup(page, "base");
    await page.goto("/comunidade");
    await abrirEditor(page);
    // sem a ferramenta no plano: nenhuma opção de card, só uma linha com o plano e o caminho para os planos
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText(/Foto no card da publicação: a partir do plano Profissional/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver planos" })).toHaveAttribute("href", "/planos?aba=mudar");
    await page.getByLabel("Texto da publicação").fill("Só texto, como sempre.");
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect.poll(() => inserts(calls).length).toBe(1);
    const row = inserts(calls)[0];
    expect(row.card_style).toBeUndefined(); expect(row.card_image_path).toBeUndefined(); expect(row.image_url).toBeNull();
    expect(calls.filter((c) => c.kind === "storage")).toHaveLength(0);
  });

  test("Grátis também vê o cadeado (e nada é enviado)", async ({ page }) => {
    const calls = await setup(page, "gratis");
    await page.goto("/comunidade");
    await abrirEditor(page);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText(/Foto no card da publicação: a partir do plano/)).toBeVisible();
    expect(calls.filter((c) => c.kind === "storage")).toHaveLength(0);
  });

  test("texto passando de 400 no card: contador vermelho e recusa antes de enviar a foto", async ({ page }) => {
    const calls = await setup(page, "intermediario");
    await page.goto("/comunidade");
    await abrirEditor(page);
    await page.getByLabel("Texto da publicação").fill("a".repeat(401));
    await radio(page, "Imagem em parte do card").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#808080"));
    await page.getByLabel(/Tenho o direito/).check();
    await expect(page.getByText("401/400 caracteres no card")).toBeVisible();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText(/até 400 caracteres/).first()).toBeVisible();
    expect(calls.filter((c) => c.kind === "storage")).toHaveLength(0);
    expect(inserts(calls)).toHaveLength(0);
  });

  test("foto inválida (PDF disfarçado ou grande demais) é recusada na hora", async ({ page }) => {
    await setup(page, "intermediario");
    await page.goto("/comunidade");
    await abrirEditor(page);
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(page.getByText("Use uma imagem JPG, PNG ou WebP.")).toBeVisible();
    await page.getByLabel("Foto do card").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("isto não é uma imagem") });
    await expect(page.getByText("Não foi possível ler essa imagem. Tente outra.")).toBeVisible();
    await expect(page.getByTestId("card-preview")).toHaveCount(0);
  });

  test("envio da foto falha: avisa, não cria o post", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house("maximo")], posts: (b) => (b ? { id: U(900), created_at: "x" } : []) }, storageOk: { status: 500, body: { message: "boom" } } });
    await page.goto("/comunidade");
    await abrirEditor(page);
    await page.getByLabel("Texto da publicação").fill("Texto");
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#333333"));
    await page.getByLabel(/Tenho o direito/).check();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText("Não foi possível enviar a foto agora. Tente novamente.")).toBeVisible();
    expect(inserts(calls)).toHaveLength(0);
  });

  test("servidor recusa o post (ex.: plano mudou): a foto enviada é apagada e o motivo aparece", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house("maximo")], posts: (b) => (b ? { status: 400, body: { code: "P0001", message: "Posts com a cara da sua casa estão disponíveis a partir do plano Profissional." } } : []) } });
    await page.goto("/comunidade");
    await abrirEditor(page);
    await page.getByLabel("Texto da publicação").fill("Texto");
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#333333"));
    await page.getByLabel(/Tenho o direito/).check();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText("Posts com a cara da sua casa estão disponíveis a partir do plano Profissional.")).toBeVisible();
    await expect.poll(() => calls.filter((c) => c.kind === "storage" && c.method === "DELETE").length).toBe(1);
  });

  test("feed: card inteiro e card em parte; texto hostil fica como texto; endereço de fora não vira imagem", async ({ page }) => {
    const row = (n, o) => ({ id: U(700 + n), house_id: HID, kind: "geral", content: `Post ${n}`, image_url: null, card_style: null, card_image_path: null, card_scrim: 55, created_at: `2026-11-1${n}T10:00:00Z`, houses: { owner_id: OWNER }, post_likes: [], post_comments: [], ...o });
    const list = [
      row(5, { card_style: "total", card_image_path: `${OWNER}/a.webp`, card_scrim: 70, content: "<img src=x onerror=window.__xss=1> Axé" }),
      row(4, { card_style: "parcial", card_image_path: `${OWNER}/b.webp`, content: "Gira de domingo" }),
      row(3, { card_style: "total", card_image_path: "https://evil.com/x.jpg", content: "Endereço de fora" }),
      row(2, { card_style: "total", card_image_path: `${OWNER}/../x.jpg`, content: "Caminho torto" }),
      row(1, { content: "Normal" }),
    ];
    await setup(page, "maximo", { list });
    await page.goto("/comunidade");
    await abrirEditor(page);
    const total = page.locator('[data-card="total"]');
    await expect(total).toHaveCount(1);
    await expect(total).toContainText("<img src=x onerror=window.__xss=1> Axé");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(total.locator("img")).toHaveAttribute("src", new RegExp(`^http://sb\\.test/storage/v1/object/public/post-images/${OWNER}/a\\.webp$`));
    await expect(page.locator('[data-card="parcial"]')).toHaveCount(1);
    await expect(page.getByText("Endereço de fora")).toBeVisible();
    await expect(page.getByText("Caminho torto")).toBeVisible();
    await expect(page.locator("img[src*='evil.com']")).toHaveCount(0);
    await expect(page.locator("img[src*='..']")).toHaveCount(0);
    const veil = await total.locator("div[aria-hidden]").evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(veil).toBe("rgba(0, 0, 0, 0.7)");
  });

  test("celular estreito: opções e prévia sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setup(page, "intermediario");
    await page.goto("/comunidade");
    await abrirEditor(page);
    await page.getByLabel("Texto da publicação").fill("Texto longo ".repeat(25));
    await radio(page, "Imagem no card todo").click();
    await page.getByLabel("Foto do card").setInputFiles(await photo(page, "#aa5500"));
    await expect(page.getByTestId("card-preview")).toBeVisible();
    await noHScroll(page);
  });
});
