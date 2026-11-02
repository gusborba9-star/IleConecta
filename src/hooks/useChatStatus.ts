import { useEffect, useState } from "react";
import { fetchAssistantName } from "@/lib/catalog";
import { chatStatus } from "@/lib/cardsCore";
import { fetchPeer } from "@/lib/messaging";

/** Quem atende no "Conversar" agora, pelos mesmos dados que o chat usa (casa online e assistente disponível). */
export function useChatStatus(ownerId: string, enabled: boolean): string {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void Promise.all([fetchPeer(ownerId), fetchAssistantName(ownerId)]).then(([peer, name]) => {
      if (alive && peer) setStatus(chatStatus({ online: peer.online, hasAssistant: Boolean(name) }));
    });
    return () => {
      alive = false;
    };
  }, [ownerId, enabled]);
  return status;
}
