import { useEffect, useState } from "react";
import { fetchHousePending } from "@/lib/housePending";

export interface HouseBadges { mensagens: number; pedidos: number; membros: number; faturas: number }
const ZERO: HouseBadges = { mensagens: 0, pedidos: 0, membros: 0, faturas: 0 };

/** Soma, por tela, o que a central de pendências já calcula (o banco filtra pela casa e pela permissão). */
export function badgesFromCounts(counts: Record<string, number>, toPayCount: number): HouseBadges {
  const n = (k: string) => (Number.isInteger(counts[k]) && counts[k] > 0 ? counts[k] : 0);
  return {
    mensagens: n("conversa_sem_resposta") + n("assunto_da_assistente"),
    pedidos: n("pedido_para_iniciar") + n("atendimento_passou") + n("reembolso_da_casa"),
    membros: n("mensalidade_vencida"),
    faturas: Number.isInteger(toPayCount) && toPayCount > 0 ? toPayCount : 0,
  };
}

// Uma consulta só para a barra de baixo, o menu lateral e o menu "Mais" (cada um chamando o hook não repete a ida ao banco).
let cache: HouseBadges = ZERO;
let at = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<(b: HouseBadges) => void>();
const TTL = 45_000;

async function refresh(force = false) {
  if (inflight) return inflight;
  if (!force && Date.now() - at < TTL) return;
  inflight = (async () => {
    const v = await fetchHousePending();
    at = Date.now();
    // Falha de leitura NÃO apaga o que já está na tela: só uma resposta válida troca os números.
    if (typeof v !== "string") {
      cache = badgesFromCounts(v.counts, v.toPay?.count ?? 0);
      listeners.forEach((l) => l(cache));
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Números das bolinhas do menu da casa. Só consulta quando `enabled` (conta de casa com login real). */
export function useHouseBadges(enabled: boolean): HouseBadges {
  const [b, setB] = useState<HouseBadges>(enabled ? cache : ZERO);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setB);
    setB(cache);
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, TTL);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { listeners.delete(setB); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled]);
  return enabled ? b : ZERO;
}

/** Para depois de pagar uma fatura ou resolver um pedido: puxa os números de novo na hora. */
export const refreshHouseBadges = () => refresh(true);
