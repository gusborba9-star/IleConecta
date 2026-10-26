import { supabase } from "@/lib/supabase";
import type { ServiceDelivery, ServiceKind, ServiceValue } from "@/lib/servicesCore";

export interface Service {
  id: string;
  kind: ServiceKind;
  customKind: string | null;
  title: string;
  description: string | null;
  priceCents: number;
  delivery: ServiceDelivery;
  active: boolean;
}

const COLS = "id, kind, custom_kind, title, description, price_cents, delivery, active";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toService = (r: Record<string, any>): Service => ({
  id: String(r.id),
  kind: r.kind,
  customKind: r.custom_kind ?? null,
  title: String(r.title),
  description: r.description ?? null,
  priceCents: Number(r.price_cents),
  delivery: r.delivery,
  active: Boolean(r.active),
});

/** No app a casa é identificada pelo id do dono; no banco, serviços usam houses.id. */
async function houseIdOf(ownerId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  return data ? String(data.id) : null;
}

/** O banco já esconde os serviços pausados de quem não é a dona da casa. */
export async function fetchServices(ownerId: string): Promise<Service[]> {
  if (!supabase) return [];
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return [];
  const { data, error } = await supabase.from("services").select(COLS).eq("house_id", houseId).order("created_at", { ascending: true });
  if (error || !data) {
    console.error("Ilê Conecta: não foi possível carregar os serviços.", error?.message);
    return [];
  }
  return data.map(toService);
}

export async function createService(ownerId: string, value: ServiceValue): Promise<Service | null> {
  if (!supabase) return null;
  const houseId = await houseIdOf(ownerId);
  if (!houseId) return null;
  const { data, error } = await supabase.from("services").insert({ house_id: houseId, ...value }).select(COLS).single();
  return error || !data ? null : toService(data);
}

export async function updateService(id: string, value: Partial<ServiceValue> & { active?: boolean }): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("services").update(value).eq("id", id);
  return !error;
}

export async function deleteService(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("services").delete().eq("id", id);
  return !error;
}
