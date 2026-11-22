import { useEffect, useState } from "react";
import { fetchFollowSummary } from "@/lib/follows";
import { fetchMemberships } from "@/lib/members";
import { fetchMyOrders } from "@/lib/serviceOrders";
import { fetchMyReservationOwners } from "@/lib/rituals";

/** Casas que a pessoa segue ou tem vínculo (mensalidade, serviço contratado ou vaga reservada). `ready` só fica true depois de ler; falha de leitura = sem vínculo. */
export function useReach(enabled: boolean, userId?: string) {
  const [state, setState] = useState<{ ready: boolean; follows: string[]; bonds: string[] }>({ ready: !enabled, follows: [], bonds: [] });
  useEffect(() => {
    if (!enabled || !userId) { setState({ ready: true, follows: [], bonds: [] }); return; }
    let alive = true;
    void Promise.all([
      fetchFollowSummary().catch(() => ({ counts: {}, mine: [] as string[] })),
      fetchMemberships().catch(() => []),
      fetchMyOrders(userId).catch(() => []),
      fetchMyReservationOwners(userId).catch(() => [] as string[]),
    ]).then(([f, m, o, r]) => {
      const bonds = [...m.map((x) => x.ownerId), ...o.flatMap((x) => (x.houseOwnerId ? [x.houseOwnerId] : [])), ...r];
      if (alive) setState({ ready: true, follows: f.mine, bonds: [...new Set(bonds)] });
    });
    return () => { alive = false; };
  }, [enabled, userId]);
  return state;
}
