// Função de borda: conversa do cliente com a assistente virtual de uma casa.
// A chave do OpenRouter vem do segredo OPENROUTER_API_KEY (nunca chega ao navegador).
// A IA só escreve texto: preço, vaga, desconto e pagamento vêm do banco/servidor (ver logic.js).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DEFAULT_MODELS,
  HISTORY_LIMIT,
  buildGreeting,
  buildSystemPrompt,
  checkGate,
  cleanReply,
  cleanUserText,
  finalizeReply,
  featureEnabled,
  monthStartISO,
  normalizeAgenda,
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
    .select("id, owner_id, name, category, plan, offerings")
    .eq("owner_id", body.house_id)
    .maybeSingle();
  if (!house) return json(404, { error: "casa_nao_encontrada" });

  // Interruptor do painel admin: desligado (ou em teste para outras casas) bloqueia antes de qualquer custo.
  const { data: featRow } = await admin.from("platform_settings").select("value").eq("key", "features").maybeSingle();
  if (!featureEnabled(featRow?.value, "assistant", house.owner_id)) {
    return json(403, { error: "recurso_desativado", message: "A assistente está temporariamente indisponível." });
  }

  const { data: assistant } = await admin
    .from("assistants")
    .select("enabled, display_name, instructions, business_hours, can_sell, can_discount, max_discount_percent, model, profile")
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

  const [{ data: history }, { data: services }, { data: events }, { data: catalog }] = await Promise.all([
    admin.from("messages").select("sender_id, from_assistant, text, created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
    admin.from("services").select("id, kind, custom_kind, delivery, title, description, price_cents, bookable, duration_min").eq("house_id", house.id).eq("active", true).limit(30),
    admin.from("events").select("id, title, description, price_cents, mode, starts_at, seats_total, intake_fields")
      .eq("house_id", house.id).eq("status", "publicado").gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }).limit(15),
    admin.from("house_catalog_items").select("name, description, price_cents, show_price, active")
      .eq("house_id", house.id).eq("active", true).order("created_at", { ascending: true }).limit(30),
  ]);

  // Agenda da casa: só as datas que a casa liberou para a assistente, e só com o calendário ligado no painel admin.
  // Qualquer falha aqui (ex.: migração ainda não aplicada) apenas deixa a agenda de fora; o atendimento segue normal.
  let agenda: string[] | null = null;
  if ((featRow?.value as { calendar?: { state?: string } } | null)?.calendar?.state === "on") {
    const { data: agendaRows, error: agendaErr } = await admin.from("house_calendar_items")
      .select("title, kind, tradition, on_date, on_time, yearly, note, vis_assistant")
      .eq("house_id", house.id).eq("vis_assistant", true).limit(80);
    if (agendaErr) console.error("agenda indisponível:", agendaErr.message);
    else agenda = normalizeAgenda(agendaRows ?? []);
  }

  // Vagas restantes vêm do banco (nunca da IA).
  const eventsWithSeats = await Promise.all((events ?? []).map(async (e) => {
    const { data: taken } = await admin.rpc("event_taken", { p_event: e.id });
    return { ...e, seats_left: Number(e.seats_total) - Number(taken ?? 0) };
  }));

  // Próximos horários livres dos serviços com agenda (vêm do banco, nunca da IA).
  const servicesWithSlots = await Promise.all((services ?? []).map(async (s) => {
    if (!s.bookable) return s;
    const { data: slots } = await admin.rpc("available_slots", { p_service: s.id, p_days: 14 });
    return { ...s, next_slots: ((slots ?? []) as { slot: string }[]).slice(0, 3).map((r) => r.slot) };
  }));

  const system = buildSystemPrompt({
    house, assistant, services: servicesWithSlots, events: eventsWithSeats, plan: house.plan, catalog: catalog ?? [], agenda,
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
  const handoff = finalizeReply(reply, text);
  reply = handoff.text;
  // Primeira resposta da assistente nesta conversa: saudação e apresentação escritas pelo servidor
  // (em assunto delicado vai direto ao acolhimento).
  if (reply && !handoff.handoff) {
    const { count: priorReplies } = await admin.from("messages").select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId).eq("from_assistant", true);
    if ((priorReplies ?? 0) === 0) {
      const { data: me } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      reply = `${buildGreeting({
        clientName: me?.display_name, assistantName: assistant?.display_name, houseName: house.name,
      })}\n\n${reply}`;
    }
  }
  if (!reply) return json(502, { error: "resposta_vazia", conversation_id: conversationId, message: "Não consegui responder agora. Tente novamente em instantes." });

  // 7) Grava a resposta (remetente = dono da casa, marcada como da assistente) e o consumo.
  await admin.from("messages").insert({
    conversation_id: conversationId, sender_id: house.owner_id, text: reply, from_assistant: true,
  });
  // Um aviso por conversa a cada 30 minutos (evita encher a casa de notificações iguais).
  const handoffHref = `/mensagens/${user.id}`;
  const { count: recentHandoffs } = handoff.handoff
    ? await admin.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", house.owner_id).eq("href", handoffHref).like("text", "%precisa de você%")
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    : { count: 0 };
  if (handoff.handoff && (recentHandoffs ?? 0) === 0) {
    const { data: who } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const name = (who?.display_name as string | undefined)?.trim() || "Um cliente";
    await admin.from("notifications").insert({
      user_id: house.owner_id,
      text: `${name} precisa de você: a assistente passou a conversa para a casa.`,
      href: handoffHref,
    });
  }
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
