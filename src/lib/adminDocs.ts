import { supabase } from "@/lib/supabase";

export interface AdminDoc {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}

/** Documentos da plataforma (só administrador lê; a política do banco garante). */
export async function fetchAdminDocs(): Promise<AdminDoc[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("admin_docs").select("slug, title, body, updated_at").order("title");
  return (data ?? []).map((d) => ({ slug: d.slug as string, title: d.title as string, body: d.body as string, updatedAt: d.updated_at as string }));
}

export async function saveAdminDoc(slug: string, title: string, body: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("admin_save_doc", { p_slug: slug, p_title: title, p_body: body });
  return !error;
}
