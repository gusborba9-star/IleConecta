// Editor de Momentos (18/11/2026): enquadrar, texto, emoji, imagem final 1080 x 1920, segurança do texto e acessibilidade.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { api, U, noHScroll } from "./_api.mjs";

const ME = U(1), HID = U(60);
const consents = [{ doc_key: "termos_casa", doc_version: "2026-11-rascunho-10", accepted_at: "2026-11-01T10:00:00Z" }];
const profile = { id: ME, account_type: "casa", display_name: "Minha Casa", avatar_url: null, bio: null, city: "Salvador", state: "BA", country: "BR", created_at: "2026-01-01T00:00:00Z" };
const house = { id: HID, owner_id: ME, name: "Minha Casa", category: "Terreiro", tags: [], cover_url: null, verified: false, offerings: "", plan: "base", created_at: "2026-01-01T00:00:00Z", profiles: { avatar_url: null } };

// foto de verdade (paisagem 600x400), gerada no próprio navegador
async function photo(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 400; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 600, 400); g.addColorStop(0, "#c0392b"); g.addColorStop(1, "#2980b9"); x.fillStyle = g; x.fillRect(0, 0, 600, 400); return c.toDataURL("image/png").split(",")[1]; });
  return { name: "foto.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}
const open = async (page) => {
  const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house], stories: [], services: [], events: [], posts: [] }, rpc: { moments_feed: [], report_client_error: true, moments_published_today: 0 } });
  await page.goto("/comunidade");
  await page.getByRole("button", { name: /Criar momento/ }).click();
  await page.locator("#moment-file").setInputFiles(await photo(page));
  const ed = page.getByRole("dialog", { name: "Editar momento" });
  await expect(ed).toBeVisible();
  return { calls, ed };
};
const size = (page) => page.getByAltText("Prévia do momento").evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight }));

test.describe("editor de momentos", () => {
  test.use({ viewport: { width: 375, height: 760 } });

  test("a foto abre no editor; sem mexer em nada, segue com a foto original", async ({ page }) => {
    const { ed } = await open(page);
    await noHScroll(page);
    await ed.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByAltText("Prévia do momento")).toBeVisible();
    expect(await size(page)).toEqual({ w: 600, h: 400 });
  });

  test("com texto, a imagem final vira 1080 x 1920 e o texto vai para dentro dela", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByRole("button", { name: "Texto", exact: true }).click();
    await ed.getByRole("button", { name: "+ Adicionar texto" }).click();
    await ed.getByLabel("Texto", { exact: true }).fill("Axé, bom dia");
    await ed.getByRole("button", { name: "Manuscrita" }).click();
    await ed.getByRole("button", { name: "Dourado" }).click();
    await ed.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByAltText("Prévia do momento")).toBeVisible();
    expect(await size(page)).toEqual({ w: 1080, h: 1920 });
  });

  test("emoji: adiciona, aparece na lista, remove; zoom e 'preencher' geram imagem final", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByRole("button", { name: "Emoji", exact: true }).click();
    await ed.getByRole("button", { name: "Adicionar 🙏" }).click();
    await ed.getByRole("button", { name: "Adicionar ✨" }).click();
    const lista = ed.getByRole("group", { name: "Itens na imagem" });
    await expect(lista.getByRole("button")).toHaveCount(2);
    await ed.getByRole("button", { name: "Remover item" }).click();
    await expect(lista.getByRole("button")).toHaveCount(1);
    await ed.getByRole("button", { name: "Enquadrar", exact: true }).click();
    await ed.getByRole("button", { name: "Preencher a tela" }).click();
    await expect(ed.getByLabel("Zoom da foto")).not.toHaveValue("1");
    await ed.getByRole("button", { name: "Concluir" }).click();
    expect(await size(page)).toEqual({ w: 1080, h: 1920 });
  });

  test("só enquadrar (sem texto) também gera a imagem final", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByLabel("Zoom da foto").fill("2");
    await ed.getByRole("button", { name: "Concluir" }).click();
    expect(await size(page)).toEqual({ w: 1080, h: 1920 });
  });

  test("limite de itens: o 11º é recusado com aviso", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByRole("button", { name: "Emoji", exact: true }).click();
    for (let i = 0; i < 11; i++) await ed.getByRole("button", { name: "Adicionar 🙏" }).click();
    await expect(page.getByText(/até 10 itens/)).toBeVisible();
    await expect(ed.getByRole("group", { name: "Itens na imagem" }).getByRole("button")).toHaveCount(10);
  });

  test("arrastar o texto na imagem muda o desenho; Delete remove o item selecionado", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByRole("button", { name: "Texto", exact: true }).click();
    await ed.getByRole("button", { name: "+ Adicionar texto" }).click();
    const cv = ed.locator("canvas");
    const before = await cv.screenshot();
    const b = await cv.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.15, { steps: 6 }); await page.mouse.up();
    expect((await cv.screenshot()).equals(before)).toBe(false);
    await cv.focus(); await page.keyboard.press("Delete");
    await expect(ed.getByRole("group", { name: "Itens na imagem" })).toHaveCount(0);
  });

  test("texto hostil fica só como texto: nada é executado nem entra na página", async ({ page }) => {
    const { ed } = await open(page);
    let dialogs = 0; page.on("dialog", (d) => { dialogs++; void d.dismiss(); });
    await ed.getByRole("button", { name: "Texto", exact: true }).click();
    await ed.getByRole("button", { name: "+ Adicionar texto" }).click();
    await ed.getByLabel("Texto", { exact: true }).fill('<img src=x onerror=alert(1)> ‮${7*7}');
    await ed.getByRole("button", { name: "Concluir" }).click();
    expect(await size(page)).toEqual({ w: 1080, h: 1920 });
    expect(dialogs).toBe(0);
    await expect(page.locator("img[src='x']")).toHaveCount(0);
  });

  test("Cancelar na primeira vez volta ao seletor; ao reabrir pela prévia, cancelar mantém a prévia", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator("#moment-file")).toBeAttached();
    await expect(page.getByAltText("Prévia do momento")).toHaveCount(0);
    await page.locator("#moment-file").setInputFiles(await photo(page));
    await page.getByRole("dialog", { name: "Editar momento" }).getByRole("button", { name: "Concluir" }).click();
    await page.getByRole("button", { name: "Editar foto" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByAltText("Prévia do momento")).toBeVisible();
  });

  test("editar de novo lembra o que já estava na imagem", async ({ page }) => {
    const { ed } = await open(page);
    await ed.getByRole("button", { name: "Emoji", exact: true }).click();
    await ed.getByRole("button", { name: "Adicionar 🌿" }).click();
    await ed.getByRole("button", { name: "Concluir" }).click();
    await page.getByRole("button", { name: "Editar foto" }).click();
    await expect(page.getByRole("dialog", { name: "Editar momento" }).getByRole("group", { name: "Itens na imagem" }).getByRole("button")).toHaveCount(1);
  });

  test("câmera: campo próprio com captura de foto; acessibilidade sem violações", async ({ page }) => {
    const calls = await api(page, { rest: { profiles: profile, legal_consents: consents, houses: [house], stories: [], services: [], events: [], posts: [] }, rpc: { moments_feed: [], report_client_error: true, moments_published_today: 0 } });
    void calls;
    await page.goto("/comunidade");
    await page.getByRole("button", { name: /Criar momento/ }).click();
    await expect(page.locator("#moment-camera")).toHaveAttribute("capture", "environment");
    await expect(page.getByText("Tirar uma foto agora")).toBeVisible();
    await page.locator("#moment-camera").setInputFiles(await photo(page));
    const ed = page.getByRole("dialog", { name: "Editar momento" });
    await expect(ed).toBeVisible();
    for (const tab of ["Texto", "Emoji", "Enquadrar"]) {
      await ed.getByRole("button", { name: tab, exact: true }).click();
      const r = await new AxeBuilder({ page }).include("[role=dialog][aria-label='Editar momento']").analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`), tab).toEqual([]);
    }
  });
});
