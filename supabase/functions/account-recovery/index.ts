// Recuperação de acesso (público, sem login): recebe o formulário "Perdi o acesso à minha conta", confirma o link
// de troca de e-mail e roda a fila de e-mails. Deploy SEM verificação de JWT (o visitante não está logado);
// a defesa está no core.js: limites, resposta e tempo uniformes, palavras fixas, sem dados da conta na resposta.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRecovery } from "./core.js";

const SITE = "https://ileconecta.com.br";
const ORIGINS = new Set([SITE, "https://www.ileconecta.com.br"]);
const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const rec = createRecovery({
  rpc: async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.code ?? "erro"}`);
    return data;
  },
  sendMail: async (m: Record<string, unknown>) => {
    const r = await fetch(`${url}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify(m) });
    if (!r.ok) throw new Error(`send-email ${r.status}`);
  },
  adminUpdateEmail: async (userId: string, email: string) => {
    const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) throw new Error("update_email");
  },
  sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  randomHex: (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  sha256: async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  cronOk: async (secret: string) => { const { data, error } = await admin.rpc("recovery_cron_ok", { p_secret: secret }); return !error && data === true; },
  siteUrl: SITE,
  log: (kind: string, detail: string) => { console.error(kind, detail); },
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors: Record<string, string> = { "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
  if (ORIGINS.has(origin)) cors["Access-Control-Allow-Origin"] = origin;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* corpo inválido: o core responde 400 */ }
  const fwd = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ip = /^[0-9a-fA-F:.]{3,45}$/.test(fwd) ? fwd : "";
  const out = await rec.handle({ method: req.method, headers: req.headers, body, ip });
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
