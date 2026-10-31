import { supabase } from "@/lib/supabase";
import { DEFAULT_CONFIG, sanitizeConfig, type PlatformConfig } from "@/lib/platformConfigCore";

export * from "@/lib/platformConfigCore";

/** Lê as configurações públicas. Se falhar (ou no modo demonstração), usa os padrões. */
export async function fetchPlatformConfig(): Promise<PlatformConfig> {
  if (!supabase) return DEFAULT_CONFIG;
  const { data, error } = await supabase.from("platform_settings").select("key, value");
  if (error || !data) return DEFAULT_CONFIG;
  const raw: Record<string, unknown> = {};
  for (const row of data) raw[row.key as string] = row.value;
  return sanitizeConfig(raw);
}

export async function fetchIsAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

export async function saveSetting(key: "features" | "pricing" | "scopes" | "payment_limits" | "referral", value: object): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("admin_set_setting", { p_key: key, p_value: value });
  return !error;
}

export interface AdminMetrics {
  users_total: number;
  houses_total: number;
  clients_total: number;
  houses_by_plan: Record<string, number>;
  signups_30d: { day: string; n: number }[];
  by_city: { country: string; state: string; city: string; users: number; houses: number }[];
  assistant_month: { replies: number; prompt_tokens: number; completion_tokens: number };
}

export async function fetchAdminMetrics(): Promise<AdminMetrics | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("admin_metrics");
  return error ? null : (data as AdminMetrics);
}

export interface AuditRow {
  id: number;
  key: string;
  created_at: string;
}

export async function fetchAudit(): Promise<AuditRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("admin_audit").select("id, key, created_at").order("id", { ascending: false }).limit(30);
  return (data ?? []) as AuditRow[];
}

export async function fetchHousesForBeta(): Promise<{ owner_id: string; name: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("houses").select("owner_id, name").order("name").limit(200);
  return (data ?? []) as { owner_id: string; name: string }[];
}
