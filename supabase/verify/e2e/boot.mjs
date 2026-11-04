// Sobe: PostgreSQL local (já rodando em 127.0.0.1:5544) com 0001–0064, Stripe simulado, camada REST, e a Edge Function REAL no Deno.
import { spawn } from "node:child_process";
import { freshDb } from "../pgbase.mjs";
import { startFakeStripe, TEST_KEY } from "./fakeStripe.mjs";
import { startShim } from "./restShim.mjs";

export const WEBHOOK_SECRET = "whsec_e2e";
export const CRON_SECRET = "cron-test-secret";
const FN_DIR = new URL("../../functions/payments/", import.meta.url);
const ENTRY = new URL("./denoEntry.ts", import.meta.url).pathname;

export async function boot({ db = "e2e", denoBin = process.env.DENO_BIN ?? "deno", port = 18787 } = {}) {
  const { c, failed } = await freshDb(db, { with64: true });
  // check_cron_secret existe no banco real mas NÃO está em nenhuma migration do repositório; stub só para o harness.
  await c.query(`create or replace function public.check_cron_secret(p_secret text) returns boolean language sql stable as $$ select p_secret = '${CRON_SECRET}' $$`);
  const stripe = await startFakeStripe();
  const shim = await startShim({ conn: { host: "127.0.0.1", port: 5544, user: "postgres", database: db }, serviceKey: "svc-key-e2e" });
  const env = {
    ...process.env, DENO_CERT: process.env.DENO_CERT ?? "/root/.ccr/ca-bundle.crt",
    STRIPE_SECRET_KEY: TEST_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, APP_URL: "https://app.e2e.test",
    SUPABASE_URL: `http://127.0.0.1:${shim.port}`, SUPABASE_SERVICE_ROLE_KEY: "svc-key-e2e",
    FAKE_STRIPE_URL: `http://127.0.0.1:${stripe.port}`, PORT: String(port), INDEX_URL: new URL("index.ts", FN_DIR).href,
  };
  const proc = spawn(denoBin, ["run", "-A", "--node-modules-dir=none", ENTRY], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (d) => (out += d)); proc.stderr.on("data", (d) => (out += d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Deno não ficou pronto em 120s:\n" + out)), 120000);
    const iv = setInterval(() => { if (out.includes("READY")) { clearInterval(iv); clearTimeout(t); resolve(); } if (proc.exitCode !== null) { clearInterval(iv); clearTimeout(t); reject(new Error("Deno saiu:\n" + out)); } }, 200);
  });
  return {
    db: c, failed, stripe, shim, base: `http://127.0.0.1:${port}`, denoOut: () => out,
    ctl: (path, body) => fetch(`http://127.0.0.1:${stripe.port}/__ctl/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }).then((r) => r.json()),
    close: async () => { proc.kill("SIGTERM"); await stripe.close(); await shim.close(); await c.end(); },
  };
}
