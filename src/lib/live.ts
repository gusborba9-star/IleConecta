import { supabase } from "@/lib/supabase";

export type LiveTopic = "messages" | "orders" | "reservations" | "refunds";

/**
 * Avisa quando algo mudou num assunto que interessa a esta pessoa (mensagens, pedidos, reservas, reembolsos).
 * Escuta só a PRÓPRIA linha de live_pings (migration 0148): o servidor de tempo real não confere a permissão de todos os conectados a cada mudança,
 * e o aviso não carrega conteúdo — quem recebe lê os dados pelas regras de sempre. Devolve a função de cancelar.
 */
export function subscribeLive(topic: LiveTopic, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  let cancelled = false;
  let channel: ReturnType<typeof client.channel> | null = null;
  void client.auth
    .getSession()
    .then(({ data }) => {
      const uid = data.session?.user.id;
      if (cancelled || !uid) return;
      channel = client
        .channel(`live-${topic}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_pings", filter: `user_id=eq.${uid}` }, (payload) => {
          const row = (payload.new ?? {}) as { topic?: string };
          if (row.topic === topic) onChange();
        })
        .subscribe();
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    if (channel) void client.removeChannel(channel);
  };
}
