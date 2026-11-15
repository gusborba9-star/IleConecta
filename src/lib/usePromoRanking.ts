import { useEffect, useMemo, useState } from "react";
import { fetchVisiblePromotions, type VisiblePromo } from "@/lib/promotions";

/** Ordem aleatória estável durante a visita: quem está em destaque se reveza entre as primeiras posições. */
export function shuffled<T>(list: T[], seed: number): T[] {
  const rank = (i: number) => { const x = Math.sin(seed * 9301 + i * 49297) * 233280; return x - Math.floor(x); };
  return list.map((v, i) => [v, rank(i)] as const).sort((a, b) => a[1] - b[1]).map((p) => p[0]);
}

/** Destaques e impulsionamentos que valem para quem está olhando (o banco já filtra pelo alcance e só entrega o que está no ar). */
export function usePromoRanking(enabled: boolean) {
  const [list, setList] = useState<VisiblePromo[]>([]);
  const [seed] = useState(() => Math.random() * 1000);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchVisiblePromotions().then((r) => alive && setList(r));
    return () => { alive = false; };
  }, [enabled]);
  return useMemo(() => {
    const owners = shuffled([...new Set(list.filter((p) => p.kind === "highlight").map((p) => p.ownerId))], seed);
    const items = list.filter((p) => p.kind === "boost" && p.itemId);
    return { highlightOwners: owners, boosted: shuffled(items, seed), boostedIds: new Set(items.map((p) => p.itemId as string)) };
  }, [list, seed]);
}
