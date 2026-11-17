import { supabase } from "@/lib/supabase";

/** Avisos de movimento da casa: o que toca o sino quando alguém interage (0141). Padrão: tudo ligado. */
export const SOCIAL_KEYS = ["notify_likes", "notify_comments", "notify_follows"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type SocialPrefs = Record<SocialKey, boolean>;

export const SOCIAL_DEFAULT: SocialPrefs = { notify_likes: true, notify_comments: true, notify_follows: true };

export async function fetchSocialPrefs(userId: string): Promise<SocialPrefs> {
  if (!supabase) return SOCIAL_DEFAULT;
  const { data } = await supabase.from("notification_prefs").select("notify_likes, notify_comments, notify_follows").eq("user_id", userId).maybeSingle();
  if (!data) return SOCIAL_DEFAULT;
  // só `false` desliga: valor ausente ou estranho mantém o padrão (ligado)
  return { notify_likes: data.notify_likes !== false, notify_comments: data.notify_comments !== false, notify_follows: data.notify_follows !== false };
}

/** Grava só a coluna mexida (as outras preferências ficam como estão). Devolve true se salvou. */
export async function saveSocialPref(userId: string, key: SocialKey, on: boolean): Promise<boolean> {
  if (!supabase || !SOCIAL_KEYS.includes(key)) return false;
  const { error } = await supabase.from("notification_prefs").upsert({ user_id: userId, [key]: on, updated_at: new Date().toISOString() });
  return !error;
}
