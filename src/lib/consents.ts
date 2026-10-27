import { supabase } from "@/lib/supabase";
import { LEGAL_VERSION, type ConsentDocKey } from "@/lib/legalCore";

/** Grava os aceites na ordem. Devolve null em caso de sucesso, ou a mensagem de erro. */
export async function recordConsents(docs: ConsentDocKey[], contextId?: string): Promise<string | null> {
  if (!supabase) return null;
  for (const doc of docs) {
    const { error } = await supabase.rpc("record_consent", { p_doc: doc, p_version: LEGAL_VERSION, p_context: contextId ?? null });
    if (error) return error.message;
  }
  return null;
}

/** A casa já aceitou os termos da casa (em qualquer versão)? */
export async function fetchHouseTermsAccepted(userId: string): Promise<boolean> {
  if (!supabase) return true;
  const { data } = await supabase.from("legal_consents").select("id").eq("user_id", userId).eq("doc_key", "termos_casa").limit(1);
  return (data ?? []).length > 0;
}

/** Os pagamentos pela plataforma estão ligados para a casa deste dono? */
export async function paymentsEnabledFor(ownerId: string | undefined): Promise<boolean> {
  if (!supabase || !ownerId) return false;
  const { data } = await supabase.rpc("payments_enabled", { p_owner: ownerId });
  return data === true;
}
