// Suporte (lado do servidor que precisa de poder sobre o login): senha, confirmação de e-mail, estado da conta e exclusões.
// Duas portas: (1) administrador logado (cabeçalho Authorization); (2) rotina do banco (cabeçalho x-push-secret, guardado no Vault).
// Regras em core.js. Segredos: os do próprio Supabase (URL, chave de serviço e chave pública).
import { createClient } from "npm:@supabase/supabase-js@2";
import { SupportError, runAdminAction, runDeletions } from "./core.js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = async (name: string, args: Record<string, unknown>): Promise<any> => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo_nao_permitido" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }

  try {
    // porta da rotina
    const secret = req.headers.get("x-push-secret");
    if (secret !== null) {
      const { data: cfg } = await admin.rpc("push_config");
      if (!cfg?.webhook_secret || secret !== cfg.webhook_secret) return json({ error: "nao_autorizado" }, 401);
      if (body.action !== "run_deletions") return json({ error: "acao_invalida" }, 400);
      const result = await runDeletions({
        rpc,
        authAdmin: admin.auth.admin,
        storage: { remove: (bucket: string, paths: string[]) => admin.storage.from(bucket).remove(paths) },
        randomPassword: () => crypto.randomUUID() + crypto.randomUUID(),
      });
      return json(result);
    }

    // porta do administrador
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "nao_autorizado" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "nao_autorizado" }, 401);
    const asUser = createClient(SB_URL, SB_ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const result = await runAdminAction({
      isAdmin: async () => Boolean((await asUser.rpc("is_admin")).data),
      actorId: u.user.id,
      authAdmin: admin.auth.admin,
      authPublic: createClient(SB_URL, SB_ANON, { auth: { persistSession: false } }).auth,
      rpc,
    }, body);
    return json(result);
  } catch (e) {
    if (e instanceof SupportError) return json({ error: e.code, message: e.message }, e.status);
    console.error("support-admin", e instanceof Error ? e.message : e);
    return json({ error: "erro_interno" }, 500);
  }
});
