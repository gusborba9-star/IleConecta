import { supabase } from "@/lib/supabase";

export type CatalogMode = "combinar" | "agenda";

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  /** Valor em centavos; null = sem valor cadastrado. */
  priceCents: number | null;
  /** Só com true a assistente pode informar o valor ao cliente. */
  showPrice: boolean;
  mode: CatalogMode;
  active: boolean;
}

export const CATALOG_MAX_ITEMS = 30;
export const MAX_PRICE_CENTS = 10_000_000;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fromRow = (r: Row): CatalogItem => ({
  id: String(r.id),
  name: String(r.name),
  description: String(r.description ?? ""),
  priceCents: r.price_cents === null || r.price_cents === undefined ? null : Number(r.price_cents),
  showPrice: Boolean(r.show_price),
  mode: r.mode === "agenda" ? "agenda" : "combinar",
  active: r.active !== false,
});

/** "200", "200,50" ou "1.200,00" → centavos; "" → null; inválido → undefined. */
export function parsePriceToCents(input: string): number | null | undefined {
  const t = input.replace(/[R$\s]/g, "");
  if (!t) return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return cents >= 0 && cents <= MAX_PRICE_CENTS ? cents : undefined;
}

export function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function fetchCatalog(houseId: string): Promise<CatalogItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("house_catalog_items")
    .select("id, name, description, price_cents, show_price, mode, active")
    .eq("house_id", houseId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map(fromRow);
}

export async function addCatalogItem(houseId: string, item: Omit<CatalogItem, "id">): Promise<CatalogItem | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("house_catalog_items")
    .insert({
      house_id: houseId,
      name: item.name.trim(),
      description: item.description.trim(),
      price_cents: item.priceCents,
      show_price: item.priceCents !== null && item.showPrice,
      mode: item.mode,
      active: item.active,
    })
    .select("id, name, description, price_cents, show_price, mode, active")
    .single();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateCatalogItem(item: CatalogItem): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("house_catalog_items")
    .update({
      name: item.name.trim(),
      description: item.description.trim(),
      price_cents: item.priceCents,
      show_price: item.priceCents !== null && item.showPrice,
      mode: item.mode,
      active: item.active,
    })
    .eq("id", item.id);
  return !error;
}

export async function deleteCatalogItem(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("house_catalog_items").delete().eq("id", id);
  return !error;
}

/** Nome que a assistente da casa usa com o cliente (null se não houver assistente ativa). */
export async function fetchAssistantName(ownerId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("assistant_display_name", { p_owner: ownerId });
  if (error || typeof data !== "string" || !data.trim()) return null;
  return data.trim();
}
