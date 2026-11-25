import { supabase } from "@/lib/supabase";

export type SignalKind = "visita" | "oferta" | "compartilhar";

const sentThisLoad = new Set<string>();
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Código aleatório do aparelho, trocado todo dia (não liga a pessoa de um dia ao outro nem de uma casa à outra: o servidor ainda mistura com a casa e um segredo). */
function clientCode(): string {
  const d = today();
  try {
    const raw = localStorage.getItem("ic_sig");
    const saved = raw ? (JSON.parse(raw) as { d?: string; c?: string }) : null;
    if (saved?.d === d && typeof saved.c === "string" && saved.c.length >= 12) return saved.c;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const c = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("ic_sig", JSON.stringify({ d, c }));
    return c;
  } catch {
    return "";
  }
}

/** Avisa o servidor que alguém viu a página da casa, abriu uma oferta ou compartilhou. Silencioso: nunca atrapalha a tela e respeita "não rastrear" do navegador. */
export function trackHouseSignal(ownerId: string | undefined, kind: SignalKind, { once = true }: { once?: boolean } = {}): void {
  if (!supabase || !ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) return;
  if (typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true)) return;
  const k = `${ownerId}|${kind}|${today()}`;
  if (once && sentThisLoad.has(k)) return;
  sentThisLoad.add(k);
  void supabase.rpc("track_house_signal", { p_owner: ownerId, p_kind: kind, p_client: clientCode() || null }).then(() => undefined, () => undefined);
}

export interface SignalsRaw { enabled: boolean; days: number; signals?: Record<string, { current: { events: number; people: number }; previous: { events: number; people: number } }> }
export async function fetchHouseSignals(days: number): Promise<SignalsRaw | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("house_signals", { p_days: days });
  if (error || !data || typeof data !== "object") return null;
  return data as SignalsRaw;
}
