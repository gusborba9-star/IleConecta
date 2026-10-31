import { supabase } from "@/lib/supabase";

export interface ReferralItem {
  name: string;
  status: "pendente" | "concedido" | "recusado";
  reason: string | null;
  at: string;
}
export interface MyReferral {
  code: string;
  enabled: boolean;
  rewardDays: number;
  referredDays: number;
  monthlyCap: number;
  grantedThisMonth: number;
  activeUntil: string | null;
  items: ReferralItem[];
}

const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export async function fetchMyReferral(): Promise<MyReferral | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_referral");
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    code: String(d.code ?? ""),
    enabled: d.enabled === true,
    rewardDays: num(d.reward_days, 7),
    referredDays: num(d.referred_days, 0),
    monthlyCap: num(d.monthly_cap, 3),
    grantedThisMonth: num(d.granted_this_month),
    activeUntil: typeof d.active_until === "string" ? d.active_until : null,
    items: Array.isArray(d.items) ? (d.items as ReferralItem[]) : [],
  };
}

/** Casas com destaque ativo (id do dono -> data em que termina). */
export async function fetchFeatured(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("house_featured");
  return error || !data || typeof data !== "object" ? {} : (data as Record<string, string>);
}

/** Nome da casa que indicou (só se o programa estiver ligado e o código existir). */
export async function lookupReferral(code: string): Promise<string | null> {
  if (!supabase || !code) return null;
  const { data, error } = await supabase.rpc("referral_lookup", { p_code: code });
  return error || typeof data !== "string" ? null : data;
}

export const referralLink = (code: string, origin = typeof window !== "undefined" ? window.location.origin : "") =>
  `${origin}/register?tipo=casa&ref=${encodeURIComponent(code)}`;

/** Código recebido pelo link, guardado para sobreviver a uma ida e volta entre login e cadastro. */
const KEY = "ile:ref";
export function rememberReferral(code: string | null): string {
  try {
    if (code) localStorage.setItem(KEY, code.toUpperCase().slice(0, 12));
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return code ? code.toUpperCase().slice(0, 12) : "";
  }
}
export function forgetReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: nada a limpar */
  }
}
