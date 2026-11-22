import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { fetchPublishedRitualsCached, type RealRitual } from "@/lib/rituals";
import { modeLabel } from "@/lib/ritualsCore";
import { dateBlock } from "@/lib/nearYouCore.js";

/** Cartão da gira anexada a uma publicação: data em destaque, vagas e "Reservar vaga". Some se o ritual não está mais aberto. */
export default function PostEvent({ eventId, city }: { eventId: string; city?: string }) {
  const [r, setR] = useState<RealRitual | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchPublishedRitualsCached().then((l) => alive && setR(l.find((x) => x.id === eventId) ?? null));
    return () => { alive = false; };
  }, [eventId]);
  if (!r || !r.ownerId) return null;
  const d = dateBlock(r.startsAt);
  const left = Math.max(0, r.seatsTotal - r.taken);
  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-2xl bg-forest text-forest-foreground">
      <div className="flex items-center gap-3 p-3.5">
        <span aria-hidden className="grid h-14 w-12 shrink-0 place-content-center rounded-xl bg-white/10 text-center">
          <span className="text-[10px] font-bold leading-none tracking-wider text-gold">{d.month}</span>
          <span className="mt-0.5 text-xl font-bold leading-none">{d.day}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{r.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-forest-foreground/80">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{d.time} · {modeLabel(r.mode)}</span>
            {city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{city}</span>}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3.5 py-2.5">
        <span className="text-xs text-forest-foreground/80">{left === 0 ? "Vagas esgotadas" : left <= 5 ? `Últimas ${left} vagas` : `${left} vagas`}</span>
        <Link to={`/casa/${r.ownerId}?aba=rituais`} className="inline-flex min-h-9 items-center rounded-full bg-gold px-4 text-sm font-semibold text-gold-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          {left === 0 ? "Ver gira" : "Reservar vaga"}
        </Link>
      </div>
    </div>
  );
}
