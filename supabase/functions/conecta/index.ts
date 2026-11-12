// Função de borda: Conecta, a assistente de apoio da plataforma (suporte). A chave do OpenRouter vem do segredo OPENROUTER_API_KEY.
// Quem fala é sempre identificado pelo JWT; a assistente só lê a PRÓPRIA conta e não escreve nada (exceto o aviso de risco de vida, feito com a identidade da pessoa).
import { createClient } from "npm:@supabase/supabase-js@2";
import { ConectaError, runConecta } from "./core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const REASONING = ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"];
const MODELS = (Deno.env.get("CONECTA_MODELS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const models = MODELS.length ? MODELS : ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"];
const params = (m: string) => (REASONING.includes(m) ? { max_tokens: 1500, reasoning: { effort: "low", exclude: true } } : { max_tokens: 700, temperature: 0.3 });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo_nao_permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json(503, { error: "assistente_indisponivel", message: "A assistente está em configuração. Use o botão Relatar ocorrência." });

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json(401, { error: "nao_autenticado" });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  let body: { message?: unknown; history?: unknown } = {};
  try { body = await req.json(); } catch { return json(400, { error: "json_invalido" }); }

  try {
    const result = await runConecta({
      allow: async () => Boolean((await admin.rpc("conecta_allow", { p_user: user.id })).data),
      accountContext: async () => {
        const { data, error } = await asUser.rpc("conecta_account_context");
        if (error) throw new Error(error.message);
        return data;
      },
      recentRiskCase: async () => {
        const { count } = await admin.from("support_cases").select("id", { count: "exact", head: true })
          .eq("opened_by", user.id).eq("kind", "risco_vida").gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
        return (count ?? 0) > 0;
      },
      openRiskCase: async (title: string, description: string) => {
        const { error } = await asUser.rpc("open_support_case", { p_kind: "risco_vida", p_title: title, p_description: description, p_source: "assistente" });
        if (error) console.error("conecta risco", error.message);
      },
      callModel: async (system: string, messages: { role: string; content: string }[]) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 25_000);
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST", signal: ctrl.signal,
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://ile-conecta.vercel.app", "X-Title": "Ile Conecta" },
            body: JSON.stringify({ model: models[0], models, messages: [{ role: "system", content: system }, ...messages], ...params(models[0]), user: user.id }),
          });
          if (!res.ok) throw new Error(`openrouter_${res.status}`);
          const out = await res.json();
          return String(out?.choices?.[0]?.message?.content ?? "");
        } finally { clearTimeout(t); }
      },
    }, body);
    return json(200, result);
  } catch (e) {
    if (e instanceof ConectaError) return json(e.status, { error: e.code, message: e.message });
    console.error("conecta", e instanceof Error ? e.message : e);
    return json(500, { error: "erro_interno", message: "Não foi possível responder agora." });
  }
});
