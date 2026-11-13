import { supabase } from "@/lib/supabase";
import { readAdminCharge, readConfig, type AdminCharge, type ConfigForm } from "@/lib/billingAdminCore";

export interface Enrollment { houseId: string; day: number; active: boolean; level: string; cancelled?: boolean }
export interface DupEvent { id: number; chargeId: string | null; reason: string; at: string }

export async function fetchBillingConfig(): Promise<ConfigForm | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", "billing_config").maybeSingle();
  if (error) return null;
  return readConfig(data?.value);
}

export async function fetchEnrollments(): Promise<Enrollment[]> {
  if (!supabase) return [];
  const [plans, states] = await Promise.all([
    supabase.from("house_billing_plan").select("house_id, billing_day, active"),
    supabase.from("house_billing_state").select("house_id, suspended, total, cancelled_at"),
  ]);
  const st = new Map((states.data ?? []).map((s) => [String(s.house_id), s.total ? "total" : s.suspended ? "parcial" : "ok"]));
  const canc = new Set((states.data ?? []).filter((s) => s.cancelled_at).map((s) => String(s.house_id)));
  return (plans.data ?? []).map((p) => ({ houseId: String(p.house_id), day: Number(p.billing_day), active: p.active === true, level: st.get(String(p.house_id)) ?? "ok", cancelled: canc.has(String(p.house_id)) }));
}

export async function fetchAdminCharges(limit = 60): Promise<AdminCharge[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("platform_charges")
    .select("id, house_id, kind, description, amount_cents, due_date, status, processor_fee_cents")
    .order("due_date", { ascending: false }).limit(limit);
  return (data ?? []).map(readAdminCharge);
}

export async function fetchDuplicates(): Promise<DupEvent[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("platform_billing_events").select("id, charge_id, reason, created_at")
    .eq("kind", "pagamento_duplicado").order("created_at", { ascending: false }).limit(20);
  return (data ?? []).map((e) => ({ id: Number(e.id), chargeId: e.charge_id ? String(e.charge_id) : null, reason: String(e.reason ?? ""), at: String(e.created_at) }));
}

function msg(error: { message?: string } | null, fallback: string): string {
  const m = error?.message ?? "";
  return /[ãçéíóú]/i.test(m) && m.length < 200 ? m : fallback;
}

export async function enrollHouse(house: string, day: number, reason: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("admin_billing_enroll", { p_house: house, p_day: day, p_reason: reason });
  return error ? msg(error, "Não foi possível matricular a casa.") : null;
}

export async function unenrollHouse(house: string, reason: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("admin_billing_unenroll", { p_house: house, p_reason: reason });
  return error ? msg(error, "Não foi possível retirar a casa.") : null;
}

export async function reactivateHouse(house: string, reason: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("admin_billing_reactivate", { p_house: house, p_reason: reason });
  return error ? msg(error, "Não foi possível reativar a casa.") : null;
}

export async function cancelCharge(id: string, reason: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("platform_charge_cancel", { p_charge: id, p_reason: reason });
  return error ? msg(error, "Não foi possível cancelar a fatura.") : null;
}

export interface PriceChange { id: string; plan: string; oldCents: number; newCents: number; announcedOn: string; effectiveOn: string; status: "anunciado" | "aplicado" | "cancelado"; notified: number }

export async function fetchPriceChanges(limit = 20): Promise<PriceChange[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("platform_price_changes").select("id, plan, old_cents, new_cents, announced_on, effective_on, status, notified").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: String(r.id), plan: String(r.plan), oldCents: Number(r.old_cents), newCents: Number(r.new_cents), announcedOn: String(r.announced_on), effectiveOn: String(r.effective_on),
    status: r.status === "aplicado" ? "aplicado" : r.status === "cancelado" ? "cancelado" : "anunciado", notified: Number(r.notified) || 0,
  }));
}

/** Anuncia o aumento de mensalidade de um plano (vigência a partir de 30 dias) e avisa as casas matriculadas. Devolve o erro, ou { notified }. */
export async function announcePriceChange(plan: string, newMonthly: number, effectiveOn: string, reason: string): Promise<{ error: string | null; notified?: number }> {
  if (!supabase) return { error: "Indisponível." };
  const { data, error } = await supabase.rpc("admin_price_announce", { p_plan: plan, p_new_monthly: newMonthly, p_effective_on: effectiveOn, p_reason: reason || null });
  if (error) return { error: msg(error, "Não foi possível anunciar o reajuste.") };
  return { error: null, notified: Number((data as { notified?: number } | null)?.notified ?? 0) };
}

export async function cancelPriceChange(id: string, reason: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("admin_price_cancel", { p_change: id, p_reason: reason });
  return error ? msg(error, "Não foi possível cancelar o reajuste.") : null;
}
