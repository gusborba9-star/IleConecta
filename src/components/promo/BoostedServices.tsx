import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/base";
import { supabase } from "@/lib/supabase";
import { formatCents } from "@/lib/servicesCore";
import type { VisiblePromo } from "@/lib/promotions";

interface Row { id: string; title: string; priceCents: number; houseName: string; ownerId: string }

/** Serviços impulsionados para quem está olhando. Identificados como "Promovido". Só aparece se houver algum no alcance. */
export default function BoostedServices({ boosted }: { boosted: VisiblePromo[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const ids = boosted.filter((p) => p.itemType === "service" && p.itemId).slice(0, 6).map((p) => p.itemId as string);
  const key = ids.join(",");
  useEffect(() => {
    if (!supabase || ids.length === 0) { setRows([]); return; }
    let alive = true;
    void supabase.from("services").select("id, title, price_cents, houses(name, owner_id)").in("id", ids).then(({ data }) => {
      if (!alive || !data) return;
      const order = new Map(ids.map((id, i) => [id, i]));
      setRows((data as unknown as { id: string; title: string; price_cents: number; houses: { name: string; owner_id: string } | null }[])
        .flatMap((r) => (r.houses ? [{ id: String(r.id), title: String(r.title), priceCents: Number(r.price_cents), houseName: String(r.houses.name), ownerId: String(r.houses.owner_id) }] : []))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Serviços em evidência">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="font-display font-bold text-lg">Serviços em evidência</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => (
          <Link key={r.id} to={`/casa/${r.ownerId}?aba=servicos`} className="block">
            <Card className="lift p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-sm text-muted-foreground">{r.houseName} · {formatCents(r.priceCents)}</div>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Promovido</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
