import { supabase } from "@/lib/supabase";
import { placeArgs } from "@/lib/placeStore";
import { readFunnel, readAvailability, readMyPromotions, type PromoKind, type PromoScopeKey } from "@/lib/promotionsCore";

export async function fetchMyPromotions() {
  if (!supabase) return readMyPromotions(null);
  const { data, error } = await supabase.rpc("my_promotions");
  return readMyPromotions(error ? null : data);
}

export async function fetchPromoAvailability() {
  if (!supabase) return readAvailability(null);
  const { data, error } = await supabase.rpc("promo_availability");
  return readAvailability(error ? null : data);
}

async function invoke(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null; code?: string }> {
  if (!supabase) return { data: null, error: "Indisponível." };
  const { data, error } = await supabase.functions.invoke("platform-billing", { body });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      const b = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      return { data: null, error: b?.error ?? "Não foi possível concluir agora. Tente de novo.", code: b?.code };
    } catch {
      return { data: null, error: "Não foi possível concluir agora. Tente de novo." };
    }
  }
  return { data: (data ?? {}) as Record<string, unknown>, error: null };
}

export interface BuyPromoInput { kind: PromoKind; scope: PromoScopeKey; days: number; itemType?: "service" | "event" | "post"; itemId?: string; authorized: boolean; method?: "pix" | "card" | null }

/** Abre a página segura de pagamento. Devolve o erro (em português) ou null se já redirecionou. `full` = acabaram as vagas. */
export async function buyPromotion(i: BuyPromoInput): Promise<{ error: string | null; full?: boolean }> {
  const r = await invoke({ action: "buy_promo", kind: i.kind, scope: i.scope, days: i.days, item_type: i.itemType ?? null, item_id: i.itemId ?? null, authorized: i.authorized, method: i.method ?? null });
  if (r.error) return { error: r.error, full: r.code === "sem_vaga" };
  const url = (r.data as { url?: string } | null)?.url;
  if (!url) return { error: "Não foi possível abrir o pagamento." };
  window.location.assign(url);
  return { error: null };
}

/** Marca (ou desmarca) que, concluído o reembolso desta compra, a publicação impulsionada deve ser excluída. Devolve null se salvou ou a mensagem do motivo. */
export async function setPostDeleteAfterRefund(chargeId: string, on: boolean): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("house_set_post_delete_after_refund", { p_charge: chargeId, p_on: on });
  return error ? "Não foi possível preparar o pedido agora. Tente novamente." : null;
}

export async function requestPromoRefund(chargeId: string): Promise<{ error: string | null; pending?: boolean }> {
  const r = await invoke({ action: "promo_refund", charge_id: chargeId });
  if (r.error) return { error: r.error };
  return { error: null, pending: (r.data as { status?: string } | null)?.status === "pending" };
}

export async function joinPromoWaitlist(scope: PromoScopeKey): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("promo_waitlist_join", { p_scope: scope });
  return error ? error.message : null;
}

export async function leavePromoWaitlist(scope: PromoScopeKey): Promise<void> {
  if (supabase) await supabase.rpc("promo_waitlist_leave", { p_scope: scope });
}

/** O que está em destaque agora para quem está olhando (alcance já filtrado pelo banco). */
export interface VisiblePromo { id: string; kind: PromoKind; scope: PromoScopeKey; houseId: string; ownerId: string; itemType: string | null; itemId: string | null }
export async function fetchVisiblePromotions(): Promise<VisiblePromo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("promotions_visible", placeArgs());
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((r: Record<string, unknown>) => (r && typeof r.id === "string" && (r.kind === "boost" || r.kind === "highlight") && typeof r.house_id === "string" && typeof r.owner_id === "string"
    ? [{ id: r.id, kind: r.kind as PromoKind, scope: r.scope as PromoScopeKey, houseId: r.house_id, ownerId: r.owner_id, itemType: typeof r.item_type === "string" ? r.item_type : null, itemId: typeof r.item_id === "string" ? r.item_id : null }] : []));
}

/** Registra que a promoção foi vista ou aberta. O banco só conta o que está no ar para quem vê, uma vez por pessoa por dia. Falha em silêncio. */
export async function trackPromotions(ids: string[], kind: "view" | "open", newIds: string[] = []): Promise<void> {
  if (!supabase || ids.length === 0) return;
  try { await supabase.rpc("promo_track", { p_ids: ids.slice(0, 50), p_kind: kind, ...placeArgs(), ...(kind === "view" && newIds.length ? { p_new_ids: newIds.slice(0, 50) } : {}) }); } catch { /* contagem nunca atrapalha a tela */ }
}

/** Conversões atribuídas por anúncio (só da própria casa). Sem dado ou com falha: vazio, e a tela mostra só visualizações e aberturas. */
export async function fetchPromoFunnel() {
  if (!supabase) return readFunnel(null);
  const { data, error } = await supabase.rpc("promo_funnel");
  return readFunnel(error ? null : data);
}
