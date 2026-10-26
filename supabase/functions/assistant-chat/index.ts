// Função de borda: conversa do cliente com a assistente virtual de uma casa.
// A chave do OpenRouter vem do segredo OPENROUTER_API_KEY (nunca chega ao navegador).
// A IA só escreve texto: preço, vaga, desconto e pagamento vêm do banco/servidor (ver logic.js).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DEFAULT_MODELS,
  HISTORY_LIMIT,
  buildSystemPrompt,
  checkGate,
  cleanReply,
  cleanUserText,
  monthStartISO,
  planLimits,
  toChatMessages,
  windowStartISO,
} from "./logic.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MESSAGES: Record<string, string> = {
  plano_sem_assistente: "A assistente não está disponível no plano desta casa.",
  assistente_desativada: "Esta casa ainda não ativou a assistente. Fale diretamente com a casa.",
  cota_mensal: "A assistente desta casa atingiu o limite de atendimentos do mês. Fale diretamente com a casa.",
  muitas_mensagens: "Você enviou muitas mensagens seguidas. Aguarde alguns minutos e tente de novo.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo_nao_permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) return json(503, { error: "assistente_indisponivel", message: "Assistente em configuração." });

  // 1) Quem está falando (JWT do usuário logado).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json(401, { error: "nao_autenticado" });

  // 2) Entrada.
  let body: { house_id?: string; conversation_id?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "json_invalido" });
  }
  const text = cleanUserText(body.message);
  if (!text) return json(400, { error: "mensagem_vazia" });
  if (typeof body.house_id !== "string") return json(400, { error: "casa_obrigatoria" });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // No app, a casa é identificada pelo id do dono (profiles.id).
  const { data: house } = await admin
    .from("houses")
    .select("id, owner_id, name, category, plan")
    .eq("owner_id", body.house_id)
    .maybeSingle();
  if (!house) return json(404, { error: "casa_nao_encontrada" });

  const { data: assistant } = await admin
    .from("assistants")
    .select("enabled, display_name, instructions, business_hours, can_sell, can_discount, max_discount_percent, model")
    .eq("house_id", house.id)
    .maybeSingle();

  // 3) Plano, cota mensal e limite por usuário.
  const [{ count: usedMonth }, { count: usedWindow }] = await Promise.all([
    admin.from("assistant_usage").select("id", { count: "exact", head: true })
      .eq("house_id", house.id).gte("created_at", monthStartISO()),
    admin.from("assistant_usage").select("id", { count: "exact", head: true })
      .eq("house_id", house.id).eq("user_id", user.id).gte("created_at", windowStartISO()),
  ]);
  const blocked = checkGate({
    plan: house.plan,
    assistant,
    usedThisMonth: usedMonth ?? 0,
    usedByUserInWindow: usedWindow ?? 0,
  });
  if (blocked) return json(blocked === "cota_mensal" || blocked === "muitas_mensagens" ? 429 : 403, {
    error: blocked,
    message: MESSAGES[blocked],
  });

  // 4) Conversa (cria se não existir) — o usuário precisa ser membro.
  let conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;
  if (conversationId) {
    const { data: member } = await admin.from("conversation_members").select("user_id")
      .eq("conversation_id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!member) return json(403, { error: "conversa_invalida" });
  } else {
    const { data: conv, error: convErr } = await admin.from("conversations").insert({}).select("id").single();
    if (convErr || !conv) return json(500, { error: "falha_conversa" });
    conversationId = conv.id as string;
    const members = Array.from(new Set([user.id, house.owner_id])).map((uid) => ({ conversation_id: conversationId, user_id: uid }));
    const { error: memErr } = await admin.from("conversation_members").insert(members);
    if (memErr) return json(500, { error: "falha_conversa" });
  }

  // 5) Grava a mensagem do cliente e carrega o histórico.
  const { error: insErr } = await admin.from("messages").insert({
    conversation_id: conversationId, sender_id: user.id, text, from_assistant: false,
  });
  if (insErr) return json(500, { error: "falha_mensagem" });

  const [{ data: history }, { data: services }, { data: events }] = await Promise.all([
    admin.from("messages").select("sender_id, from_assistant, text, created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
    admin.from("services").select("kind, title, description, price_cents").eq("house_id", house.id).eq("active", true).limit(30),
    admin.from("events").select("title, description, price_cents, mode, starts_at")
      .eq("house_id", house.id).eq("status", "publicado").gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }).limit(15),
  ]);

  const system = buildSystemPrompt({
    house, assistant, services: services ?? [], events: events ?? [], plan: house.plan,
  });
  const chat = toChatMessages((history ?? []).slice().reverse(), house.owner_id);

  // 6) Chama o OpenRouter (modelo barato por padrão; com alternativas se falhar).
  const models = assistant?.model ? [assistant.model, ...DEFAULT_MODELS] : DEFAULT_MODELS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let reply = "";
  let usedModel = models[0];
  let promptTokens = 0;
  let completionTokens = 0;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ile-conecta.vercel.app",
        "X-Title": "Ile Conecta",
      },
      body: JSON.stringify({
        model: models[0],
        models,
        messages: [{ role: "system", content: system }, ...chat],
        max_tokens: 400,
        temperature: 0.5,
        user: user.id,
      }),
    });
    if (!res.ok) throw new Error(`openrouter_${res.status}`);
    const out = await res.json();
    reply = cleanReply(out?.choices?.[0]?.message?.content);
    usedModel = out?.model ?? models[0];
    promptTokens = Number(out?.usage?.prompt_tokens ?? 0);
    completionTokens = Number(out?.usage?.completion_tokens ?? 0);
  } catch (_e) {
    // Não consome cota quando o provedor falha.
    return json(502, { error: "falha_ia", conversation_id: conversationId, message: "Não consegui responder agora. Tente novamente em instantes." });
  } finally {
    clearTimeout(timer);
  }
  if (!reply) return json(502, { error: "resposta_vazia", conversation_id: conversationId, message: "Não consegui responder agora. Tente novamente em instantes." });

  // 7) Grava a resposta (remetente = dono da casa, marcada como da assistente) e o consumo.
  await admin.from("messages").insert({
    conversation_id: conversationId, sender_id: house.owner_id, text: reply, from_assistant: true,
  });
  await admin.from("assistant_usage").insert({
    house_id: house.id, user_id: user.id, model: usedModel,
    prompt_tokens: promptTokens, completion_tokens: completionTokens,
  });

  const limit = planLimits(house.plan).monthlyReplies;
  return json(200, {
    conversation_id: conversationId,
    reply,
    assistant_name: assistant?.display_name ?? "Assistente",
    remaining_this_month: Math.max(0, limit - ((usedMonth ?? 0) + 1)),
  });
});
