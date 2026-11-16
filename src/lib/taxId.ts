import { supabase } from "@/lib/supabase";
import { readTaxIdStatus, type TaxIdStatus } from "@/lib/taxIdCore";

const known = (m: string) => (m.length < 260 && /[a-zà-ú]/i.test(m) ? m : "");

export async function fetchTaxIdStatus(): Promise<TaxIdStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_tax_id_status");
  return error ? null : readTaxIdStatus(data);
}

export async function saveTaxId(doc: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("my_tax_id_set", { p_doc: doc });
  return error ? known(error.message) || "Não foi possível guardar agora." : null;
}

/** Administração: consulta o número completo (exige motivo; a consulta fica registrada). */
export async function adminViewTaxId(houseId: string, reason: string): Promise<{ doc: string | null; kind: string | null; error: string | null }> {
  if (!supabase) return { doc: null, kind: null, error: "Indisponível." };
  const { data, error } = await supabase.rpc("admin_house_tax_id", { p_house: houseId, p_reason: reason });
  if (error) return { doc: null, kind: null, error: known(error.message) || "Não foi possível consultar." };
  const o = (data ?? {}) as { set?: boolean; doc?: string; kind?: string };
  return { doc: o.set ? String(o.doc ?? "") : null, kind: o.set ? String(o.kind ?? "") : null, error: null };
}

export async function adminSetTaxId(houseId: string, doc: string, reason: string): Promise<string | null> {
  if (!supabase) return "Indisponível.";
  const { error } = await supabase.rpc("admin_house_tax_id_set", { p_house: houseId, p_doc: doc, p_reason: reason });
  return error ? known(error.message) || "Não foi possível corrigir." : null;
}
