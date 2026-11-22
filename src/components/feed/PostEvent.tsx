import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const info = `${d.time} · ${modeLabel(r.mode)}${city ? ` · ${city}` : ""} · ${left === 0 ? "esgotado" : left === 1 ? "1 vaga" : `${left} vagas`}`;
  return (
    <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-2.5">
      <span aria-hidden className="grid h-11 w-10 shrink-0 place-content-center rounded-lg bg-forest text-center text-forest-foreground">
        <span className="text-[9px] font-bold leading-none tracking-wider text-gold">{d.month}</span>
        <span className="text-base font-bold leading-none">{d.day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{r.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{info}</span>
      </span>
      <Link to={`/casa/${r.ownerId}?aba=rituais`} className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-gold px-3.5 text-sm font-semibold text-gold-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {left === 0 ? "Ver" : "Reservar"}
      </Link>
    </div>
  );
}
