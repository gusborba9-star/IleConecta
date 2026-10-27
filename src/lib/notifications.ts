import { supabase } from "@/lib/supabase";

export interface AppNotification {
  id: string;
  text: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("notifications").select("id, text, href, read, created_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((n) => ({ id: String(n.id), text: String(n.text), href: n.href ?? null, read: Boolean(n.read), createdAt: String(n.created_at) }));
}

/** Marca como lidas as notificações da própria pessoa (a regra do banco impede mexer nas dos outros). */
export async function markAllRead(): Promise<void> {
  if (!supabase) return;
  await supabase.from("notifications").update({ read: true }).eq("read", false);
}

/** Avisa quando chegar notificação nova para esta pessoa. Devolve a função de cancelar. */
export function subscribeNotifications(userId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
