import { supabase } from "@/lib/supabase";
import { placeArgs } from "@/lib/placeStore";
import { candidates, remember } from "@/lib/promoTokenCore.js";

const KEY = "ic.promo.tok";
const load = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; } };
const save = (s: Record<string, string>) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: só não atribui */ } };

/** Ao abrir um anúncio: o servidor emite o token (validade de 7 dias) e o aparelho guarda o mais recente por casa. Falha em silêncio. */
export async function openPromoToken(promotionId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.rpc("promo_open", { p_promotion_id: promotionId, ...placeArgs() });
    if (!error && typeof data === "string") save(remember(load(), data));
  } catch { /* atribuição nunca atrapalha a tela */ }
}

/**
 * Depois de criar uma conversa, pedido ou reserva: apresenta os tokens ainda válidos; o servidor confere casa, item, pessoa e data e liga ao anúncio certo.
 * Nunca bloqueia nem muda nada do que a pessoa está fazendo.
 */
const tried = new Set<string>(); // cada conversa/pedido/reserva é apresentada uma vez por visita (abrir o chat de novo não repete)
export async function attributeRef(refType: "conversation" | "service_order" | "reservation", refId: string | null | undefined): Promise<void> {
  if (!supabase || !refId || tried.has(`${refType}:${refId}`)) return;
  tried.add(`${refType}:${refId}`);
  try {
    for (const token of candidates(load())) {
      const { data } = await supabase.rpc("promo_attribute", { p_token: token, p_ref_type: refType, p_ref_id: refId });
      if (data === "ok") return;
    }
  } catch { /* idem */ }
}
