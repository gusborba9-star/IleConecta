import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { usePlace } from "@/lib/placeNow";
import { useApp } from "@/contexts/AppContext";
import { fetchPublishedRituals, type RealRitual } from "@/lib/rituals";
import { dateBlock, pickNearYou } from "@/lib/nearYouCore.js";

/** "Na sua cidade e em destaque": próximas giras e rituais em cartões compactos (data em destaque, casa, cidade e vagas). Some se não houver nada. */
export default function NearYou({ highlightOwners = [], allow }: { highlightOwners?: string[]; allow?: (ownerId: string, itemId: string) => boolean }) {
  const { users, isRemoteAuth } = useApp();
  const place = usePlace();
  const [list, setList] = useState<RealRitual[] | null>(null);
  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchPublishedRituals().then((r) => alive && setList(r));
    return () => { alive = false; };
  }, [isRemoteAuth]);

  const items = useMemo(
    () => pickNearYou({ rituals: (list ?? []).filter((r) => !allow || (r.ownerId !== null && allow(r.ownerId, r.id))), cityOf: (o: string) => users.find((u) => u.id === o)?.city, viewerCity: place.city, highlightOwners, limit: 8 }),
    [list, users, place.city, highlightOwners, allow]
  );
  if (items.length === 0) return null;
  // Só promete "sua cidade" quando há algo da cidade dela; sem localização a faixa segue com destaques e próximos rituais de qualquer lugar.
  const title = items.some((r) => r.near) ? "Na sua cidade e em destaque" : "Próximos rituais e em destaque";

  return (
    <section aria-labelledby="na-sua-cidade">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h2 id="na-sua-cidade" className="text-[15px] font-semibold">{title}</h2>
        <Link to="/rituais" className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline">Ver tudo</Link>
      </div>
      <ul className="scroll-x flex snap-x gap-2.5 pb-1">
        {items.map((r) => {
          const d = dateBlock(r.startsAt);
          return (
            <li key={r.id} className="w-[260px] shrink-0 snap-start">
              <Link to={`/casa/${r.ownerId}?aba=rituais`} className="group flex h-full gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_1px_2px_hsl(160_30%_10%/0.05)] transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span aria-hidden className="grid h-14 w-12 shrink-0 place-content-center rounded-xl bg-forest text-center text-forest-foreground">
                  <span className="text-[10px] font-bold leading-none tracking-wider text-gold">{d.month}</span>
                  <span className="mt-0.5 text-xl font-bold leading-none">{d.day}</span>
                </span>
                <span className="min-w-0 flex-1">
                  {r.featured && <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-gold-ink">Destaque</span>}
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.houseName}</span>
                  <span className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden />{d.time}</span>
                    {r.city && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{r.city}</span></span>}
                  </span>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.soldOut ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {r.soldOut ? "Esgotado" : r.left <= 5 ? `Últimas ${r.left} vagas` : `${r.left} vagas`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
