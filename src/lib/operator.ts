import { supabase } from "@/lib/supabase";
import type { OperatorPublic } from "@/lib/operatorCore.js";

export interface OperatorLogRow { at: string; by: string | null; name: string; document: string; address: string | null; email: string | null }
const fail = (e: { message?: string } | null, fb: string) => (e?.message && !/^(Failed|TypeError)/.test(e.message) ? e.message : fb);

/** Identificação pública do operador (leitura aberta). Qualquer falha = null (a página simplesmente não mostra a frase). */
export async function fetchOperator(): Promise<OperatorPublic | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("operator_identity_public");
  return error || !data ? null : (data as OperatorPublic);
}

/** Troca os dados (só o dono; o banco confere). Devolve { erro } ou { avisados }. */
export async function saveOperator(f: { name: string; document: string; address: string; email: string }, notify: boolean): Promise<{ error?: string; notified?: number }> {
  if (!supabase) return { error: "Disponível só com conta real." };
  const { data, error } = await supabase.rpc("admin_operator_set", { p_name: f.name, p_document: f.document, p_address: f.address || null, p_email: f.email || null, p_notify: notify });
  if (error) return { error: fail(error, "Não foi possível salvar.") };
  return { notified: Number((data as { notified?: number } | null)?.notified ?? 0) };
}

export async function fetchOperatorLog(): Promise<OperatorLogRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_operator_log");
  return error ? [] : ((data as OperatorLogRow[]) ?? []);
}
