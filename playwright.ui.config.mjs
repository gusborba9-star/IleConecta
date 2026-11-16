import { defineConfig, devices } from "@playwright/test";

// Telas isoladas com a API do Supabase simulada pelo próprio teste (nenhuma chamada sai para a internet).
export default defineConfig({
  testDir: "./tests/ui",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  reporter: process.env.CI ? "list" : "html",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure", screenshot: "only-on-failure", ...devices["Desktop Chrome"], ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}) },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/tests/browser/ui-harness.html",
    env: { VITE_SUPABASE_URL: "http://sb.test", VITE_SUPABASE_ANON_KEY: "anon-key-de-teste" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
