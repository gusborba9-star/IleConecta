import { test, expect } from "@playwright/test";

const demoEmail = "mari@cliente.app";
const demoPassword = "123456";

async function login(page, email = demoEmail, password = demoPassword) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("cadastro cria conta local e mantém sessão após recarga", async ({ page }) => {
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  const fields = page.locator("form input");
  await fields.nth(0).fill("Teste Persistência");
  await fields.nth(1).fill("teste.persistencia@example.test");
  await fields.nth(2).fill("senha-demo-123");
  await fields.nth(3).fill("Recife");
  await fields.nth(4).fill("PE");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.goto("/perfil", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Teste Persistência" })).toBeVisible();
  const persisted = await page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem("ile-conecta:v1:users") || "[]"),
    auth: JSON.parse(localStorage.getItem("ile-conecta:v1:auth") || "null"),
  }));
  expect(persisted.users.some((user) => user.email === "teste.persistencia@example.test")).toBe(true);
  expect(persisted.users.some((user) => user.id === persisted.auth)).toBe(true);
});

test("login demo restaura a rota protegida após recarga", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Momentos das casas")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Momentos das casas")).toBeVisible();
});

test("busca pelo campo global abre resultados e preserva a consulta após recarga", async ({ page }) => {
  await login(page);
  const search = page.getByRole("textbox", { name: "Buscar casas e rituais" });
  await search.fill("xango");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/descobrir\?q=xango/);
  await expect(page.getByRole("link", { name: /Terreiro de Xangô Airá.*Candomblé Nagô/ }).first()).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /Terreiro de Xangô Airá.*Candomblé Nagô/ }).first()).toBeVisible();
});

test("publicação aparece no feed e permanece após recarga", async ({ page }) => {
  await login(page, "oxum@ile.app");
  const content = "E2E publicação persistida 2026";
  await page.getByPlaceholder(/Compartilhe um trabalho/).fill(content);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText(content)).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(content)).toBeVisible();
});

test("mensagem enviada aparece na conversa e persiste após recarga", async ({ page }) => {
  await login(page);
  await page.goto("/mensagens/casa_1", { waitUntil: "domcontentloaded" });
  const content = "E2E mensagem persistida 2026";
  await page.getByPlaceholder("Escreva sua mensagem...").fill(content);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("section").getByText(content)).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("section").getByText(content)).toBeVisible();
});

test("reserva demonstrativa fica no perfil após recarga e modal fecha com Escape", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const key = "ile-conecta:v1:rituals";
    const rituals = JSON.parse(localStorage.getItem(key) || "[]");
    const target = rituals.find((ritual) => ritual.id === "rit_1");
    if (!target) throw new Error("Ritual de teste não foi persistido");
    target.date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(rituals));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.goto("/rituais/rit_1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Simular reserva" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Simular reserva" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simular reserva" }).click();
  await expect(page.getByText("Reserva demonstrativa registrada")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
  await page.goto("/perfil", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Ritual da Prosperidade — Oxum Dourada").first()).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Ritual da Prosperidade — Oxum Dourada").first()).toBeVisible();
});

test("boost demonstrativo expira e deixa de aparecer após recarga", async ({ page }) => {
  await login(page, "oxum@ile.app");
  await page.goto("/impulsionar", { waitUntil: "domcontentloaded" });
  const simulate = page.getByRole("button", { name: "Simular" }).first();
  await simulate.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await simulate.click();
  await expect(page.getByText(/Impulsionamento demonstrativo:/)).toBeVisible();
  await page.evaluate(() => {
    const key = "ile-conecta:v1:users";
    const users = JSON.parse(localStorage.getItem(key) || "[]");
    const house = users.find((user) => user.email === "oxum@ile.app");
    if (!house) throw new Error("Conta comercial não foi persistida");
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    users.forEach((user) => {
      if (user.boost) user.boost.expiresAt = expiredAt;
    });
    house.boost = { ...(house.boost || {}), level: "cidade", expiresAt: expiredAt };
    localStorage.setItem(key, JSON.stringify(users));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.goto("/descobrir", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Impulsionadas" })).toHaveCount(0);
});

test("layout móvel não cria overflow horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByText("Momentos das casas")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("JSON persistido inválido é recuperado sem derrubar o login", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-corrupt-once")) return;
    localStorage.setItem("ile-conecta:v1:users", "{json-inválido");
    sessionStorage.setItem("e2e-corrupt-once", "1");
  });
  await login(page);
  await expect(page.getByText("Momentos das casas")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Momentos das casas")).toBeVisible();
  const recovery = await page.evaluate(() => localStorage.getItem("ile-conecta:v1:recovery:users"));
  expect(recovery).toBe("{json-inválido");
});
