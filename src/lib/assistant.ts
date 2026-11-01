import { supabase } from "@/lib/supabase";

export type Plan = "base" | "intermediario" | "maximo";

export type Tone = "acolhedor" | "formal" | "descontraido";
export interface FaqItem { q: string; a: string }
/** Perfil que a casa escreve para a assistente conhecer a casa (limites iguais aos do servidor). */
export interface HouseProfile {
  about: string;
  tradition: string;
  tone: Tone;
  address: string;
  faq: FaqItem[];
  dont: string;
  handoff: string;
}
export const PROFILE_MAX = { about: 800, tradition: 200, address: 300, dont: 500, handoff: 400, faq: 12, faqQ: 150, faqA: 400 };
export const TONE_LABEL: Record<Tone, string> = { acolhedor: "Acolhedor", formal: "Formal", descontraido: "Descontraído" };
export const EMPTY_PROFILE: HouseProfile = { about: "", tradition: "", tone: "acolhedor", address: "", faq: [], dont: "", handoff: "" };

/** Garante tipos e tamanhos do perfil vindo do banco ou do formulário. */
export function cleanProfile(raw: unknown): HouseProfile {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const faq = (Array.isArray(r.faq) ? r.faq : [])
    .map((f) => ({ q: str((f as FaqItem)?.q, PROFILE_MAX.faqQ), a: str((f as FaqItem)?.a, PROFILE_MAX.faqA) }))
    .filter((f) => f.q && f.a)
    .slice(0, PROFILE_MAX.faq);
  return {
    about: str(r.about, PROFILE_MAX.about),
    tradition: str(r.tradition, PROFILE_MAX.tradition),
    tone: r.tone === "formal" || r.tone === "descontraido" ? r.tone : "acolhedor",
    address: str(r.address, PROFILE_MAX.address),
    faq,
    dont: str(r.dont, PROFILE_MAX.dont),
    handoff: str(r.handoff, PROFILE_MAX.handoff),
  };
}

export interface AssistantConfig {
  houseId: string; // houses.id (diferente do id do perfil)
  plan: Plan;
  enabled: boolean;
  displayName: string;
  instructions: string;
  businessHours: Record<string, string>;
  canSell: boolean;
  canDiscount: boolean;
  maxDiscountPercent: number;
  profile: HouseProfile;
}

export const DAYS: { key: string; label: string }[] = [
  { key: "seg", label: "Segunda" },
  { key: "ter", label: "Terça" },
  { key: "qua", label: "Quarta" },
  { key: "qui", label: "Quinta" },
  { key: "sex", label: "Sexta" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

/** Carrega a casa do dono logado e a configuração da assistente (cria padrão em memória se ainda não existir). */
export async function fetchMyAssistant(ownerId: string): Promise<AssistantConfig | null> {
  if (!supabase) return null;
  const { data: house, error } = await supabase.from("houses").select("id, plan").eq("owner_id", ownerId).maybeSingle();
  if (error || !house) return null;
  const { data: a } = await supabase
    .from("assistants")
    .select("enabled, display_name, instructions, business_hours, can_sell, can_discount, max_discount_percent, profile")
    .eq("house_id", house.id)
    .maybeSingle();
  return {
    houseId: house.id as string,
    plan: (house.plan as Plan) ?? "base",
    enabled: a?.enabled ?? true,
    displayName: a?.display_name ?? "Assistente",
    instructions: a?.instructions ?? "",
    businessHours: (a?.business_hours as Record<string, string>) ?? {},
    // Regra da plataforma: a assistente vende por padrão; a casa pode desligar.
    canSell: a?.can_sell ?? true,
    canDiscount: a?.can_discount ?? false,
    maxDiscountPercent: a?.max_discount_percent ?? 0,
    profile: cleanProfile(a?.profile),
  };
}

export async function saveMyAssistant(cfg: AssistantConfig): Promise<boolean> {
  if (!supabase) return false;
  const hours: Record<string, string> = {};
  for (const d of DAYS) {
    const v = (cfg.businessHours[d.key] ?? "").trim().slice(0, 40);
    if (v) hours[d.key] = v;
  }
  const { error } = await supabase.from("assistants").upsert({
    house_id: cfg.houseId,
    enabled: cfg.enabled,
    display_name: cfg.displayName.trim().slice(0, 40) || "Assistente",
    instructions: cfg.instructions.trim().slice(0, 2000) || null,
    business_hours: hours,
    can_sell: cfg.canSell,
    can_discount: cfg.canDiscount,
    max_discount_percent: Math.max(0, Math.min(100, Math.floor(cfg.maxDiscountPercent || 0))),
    profile: cleanProfile(cfg.profile),
  });
  return !error;
}

export interface ChatLine {
  id: string;
  mine: boolean;
  text: string;
  createdAt: string;
}

export interface AskResult {
  ok: boolean;
  conversationId?: string;
  reply?: string;
  assistantName?: string;
  error?: string;
  message?: string;
}

/** Envia a mensagem do cliente à assistente da casa (função de borda assistant-chat). */
export async function askAssistant(houseOwnerId: string, message: string, conversationId?: string | null): Promise<AskResult> {
  if (!supabase) return { ok: false, message: "Assistente indisponível no modo demonstração." };
  const { data, error } = await supabase.functions.invoke("assistant-chat", {
    body: { house_id: houseOwnerId, conversation_id: conversationId ?? undefined, message },
  });
  if (error) {
    // Erros 4xx/5xx trazem o corpo JSON da função em error.context (Response).
    let body: { error?: string; message?: string; conversation_id?: string } | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      body = ctx ? await ctx.json() : null;
    } catch {
      body = null;
    }
    return {
      ok: false,
      error: body?.error,
      conversationId: body?.conversation_id,
      message: body?.message ?? "Não consegui falar com a assistente agora. Tente novamente.",
    };
  }
  return {
    ok: true,
    conversationId: data.conversation_id,
    reply: data.reply,
    assistantName: data.assistant_name,
  };
}

/** Histórico de uma conversa já existente (RLS garante que só membros leem). */
export async function fetchConversationLines(conversationId: string, myId: string): Promise<ChatLine[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, text, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []).map((m) => ({
    id: m.id as string,
    mine: m.sender_id === myId,
    text: m.text as string,
    createdAt: m.created_at as string,
  }));
}
