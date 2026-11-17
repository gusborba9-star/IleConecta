import { supabase } from "@/lib/supabase";
import { readAdminList, type AdminMember } from "@/lib/adminAccessCore";

export type AdminRow = AdminMember;

export async function fetchAdmins(): Promise<AdminRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_admins");
  return error ? [] : readAdminList(data);
}

export type AdminActionResult = "ok" | "user_not_found" | "owner" | "invalid_module" | "error";

function toResult(error: { message?: string } | null): AdminActionResult {
  if (!error) return "ok";
  const m = error.message ?? "";
  if (m.includes("user_not_found")) return "user_not_found";
  if (m.includes("dono_nao")) return "owner";
  if (m.includes("modulo_invalido")) return "invalid_module";
  return "error";
}

export async function addAdmin(email: string, perms: string[]): Promise<AdminActionResult> {
  if (!supabase) return "error";
  const { error } = await supabase.rpc("admin_add_admin", { p_email: email, p_perms: perms });
  return toResult(error);
}

export async function setAdminPerms(userId: string, perms: string[]): Promise<AdminActionResult> {
  if (!supabase) return "error";
  const { error } = await supabase.rpc("admin_set_admin_perms", { p_user: userId, p_perms: perms });
  return toResult(error);
}

export async function removeAdmin(userId: string): Promise<AdminActionResult> {
  if (!supabase) return "error";
  const { error } = await supabase.rpc("admin_remove_admin", { p_user_id: userId });
  return toResult(error);
}
