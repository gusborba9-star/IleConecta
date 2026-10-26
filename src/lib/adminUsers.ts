import { supabase } from "@/lib/supabase";

export interface AdminRow {
  user_id: string;
  email: string;
  created_at: string;
}

export async function fetchAdmins(): Promise<AdminRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_admins");
  return error ? [] : ((data ?? []) as AdminRow[]);
}

export type AdminActionResult = "ok" | "user_not_found" | "last_admin" | "error";

function toResult(error: { message?: string } | null): AdminActionResult {
  if (!error) return "ok";
  if (error.message?.includes("user_not_found")) return "user_not_found";
  if (error.message?.includes("last_admin")) return "last_admin";
  return "error";
}

export async function addAdmin(email: string): Promise<AdminActionResult> {
  if (!supabase) return "error";
  const { error } = await supabase.rpc("admin_add_admin", { p_email: email });
  return toResult(error);
}

export async function removeAdmin(userId: string): Promise<AdminActionResult> {
  if (!supabase) return "error";
  const { error } = await supabase.rpc("admin_remove_admin", { p_user_id: userId });
  return toResult(error);
}
