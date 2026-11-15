import { useEffect, useState } from "react";
import { Star, TrendingUp } from "lucide-react";
import { Badge, Card } from "@/components/base";
import { fetchMyPromotions } from "@/lib/promotions";
import { promoLine, promoName, resultsLine, type MyPromo, type PromoKind } from "@/lib/promotionsCore";

/** Compras em andamento da casa, com o fim exato e os dias restantes. O contador se atualiza sozinho a cada minuto. */
export default function PromoList({ kind, refreshKey = 0, title }: { kind?: PromoKind; refreshKey?: number; title?: string }) {
  const [items, setItems] = useState<MyPromo[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    void fetchMyPromotions().then((r) => alive && setItems(r.items));
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const live = (items ?? []).filter((i) => i.status === "ativa" && (!kind || i.kind === kind) && Date.parse(i.endsAt ?? "") > now);
  if (live.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-lg">{title ?? "Em andamento"}</h2>
      <ul className="mt-3 space-y-3">
        {live.map((i) => (
          <li key={i.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
            {i.kind === "highlight" ? <Star className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden /> : <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{promoName(i)}</div>
              <div className="text-sm text-muted-foreground">{promoLine(i, now)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{resultsLine(i)}</div>
            </div>
            {i.paused ? <Badge tone="gold">Pausado</Badge> : i.queued ? <Badge tone="gold">Na fila</Badge> : <Badge tone="primary">No ar</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
