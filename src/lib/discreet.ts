import { supabase } from "@/lib/supabase";

export async function fetchDiscreet(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.from("notification_prefs").select("discreet").eq("user_id", userId).maybeSingle();
  return Boolean(data?.discreet);
}

export async function saveDiscreet(userId: string, on: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("notification_prefs").upsert({ user_id: userId, discreet: on, updated_at: new Date().toISOString() });
  return !error;
}
