import { useEffect, useState } from "react";
import { fetchFollowSummary } from "@/lib/follows";
import { fetchMemberships } from "@/lib/members";

/** Casas que a pessoa segue ou tem vínculo (mensalidade/membro). `ready` só fica true depois de ler; falha de leitura = sem vínculo. */
export function useReach(enabled: boolean, userId?: string) {
  const [state, setState] = useState<{ ready: boolean; follows: string[]; bonds: string[] }>({ ready: !enabled, follows: [], bonds: [] });
  useEffect(() => {
    if (!enabled || !userId) { setState({ ready: true, follows: [], bonds: [] }); return; }
    let alive = true;
    void Promise.all([fetchFollowSummary().catch(() => ({ counts: {}, mine: [] as string[] })), fetchMemberships().catch(() => [])]).then(([f, m]) => {
      if (alive) setState({ ready: true, follows: f.mine, bonds: m.map((x) => x.ownerId) });
    });
    return () => { alive = false; };
  }, [enabled, userId]);
  return state;
}
