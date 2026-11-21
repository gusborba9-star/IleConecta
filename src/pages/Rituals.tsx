import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import RitualCard from "@/components/feed/RitualCard";
import { Card, Input, Badge } from "@/components/base";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import PromoTrack from "@/components/promo/PromoTrack";
import { usePromoRanking } from "@/lib/usePromoRanking";
import { fetchPublishedRituals, type RealRitual } from "@/lib/rituals";
import { modeLabel, seatsLeft } from "@/lib/ritualsCore";
import { formatCents } from "@/lib/servicesCore";

const CATEGORIES = ["Todos", "prosperidade", "amor", "cura", "proteção", "justiça", "consulta"];
const MODES = ["Todos", "presencial", "distancia", "hibrido"] as const;

export default function Rituals() {
  const { rituals, isRemoteAuth } = useApp();
  const [real, setReal] = useState<RealRitual[]>([]);
  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchPublishedRituals().then((r) => alive && setReal(r));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth]);
  const promo = usePromoRanking(isRemoteAuth);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todos");
  const [mode, setMode] = useState<typeof MODES[number]>("Todos");

  const realFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return real.filter((r) => {
      if (mode !== "Todos" && r.mode !== mode) return false;
      if (term && !`${r.title} ${r.description ?? ""} ${r.houseName}`.toLowerCase().includes(term)) return false;
      return true;
    }).sort((a, b) => Number(promo.boostedIds.has(b.id)) - Number(promo.boostedIds.has(a.id)));
  }, [real, mode, q, promo.boostedIds]);

  const filtered = useMemo(() => {
    return rituals.filter((r) => {
      if (cat !== "Todos" && r.category !== cat) return false;
      if (mode !== "Todos" && r.mode !== mode) return false;
      if (q && !r.title.toLowerCase().includes(q.toLowerCase()) && !r.description.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rituals, cat, mode, q]);

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero relative overflow-hidden p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold-ink" aria-hidden />
          <h1 className="font-display font-bold text-xl sm:text-2xl">Rituais & Trabalhos</h1>
        </div>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          Rituais coletivos e trabalhos personalizados das casas. {isRemoteAuth ? "Reserve direto com a casa; as vagas são atualizadas em tempo real." : "Dados de demonstração; disponibilidade não é sincronizada entre usuários."}
        </p>
        <div className="relative mt-3">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar rituais" placeholder="Buscar por título, tema ou casa..." className="h-11 rounded-full border-transparent bg-muted pl-11" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!isRemoteAuth && (
          <div className="scroll-x -mx-1 mt-3 flex gap-1.5 px-1 whitespace-nowrap" role="group" aria-label="Filtrar por tema">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={cn("shrink-0 min-h-9 px-3.5 rounded-full text-xs font-semibold capitalize border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", cat === c ? "bg-forest text-forest-foreground border-forest shadow-card" : "border-border bg-card hover:bg-muted")}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="scroll-x -mx-1 mt-2 flex gap-1.5 px-1 whitespace-nowrap" role="group" aria-label="Filtrar por modalidade">
          {MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={cn("shrink-0 min-h-9 px-3.5 rounded-full text-xs font-semibold capitalize border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m ? "bg-forest text-forest-foreground border-forest shadow-card" : "border-border bg-card hover:bg-muted")}>
              {m === "distancia" ? "à distância" : m}
            </button>
          ))}
        </div>
      </Card>

      {isRemoteAuth && realFiltered.length > 0 && (
        <section aria-label="Rituais das casas" className="space-y-3">
          <h2 className="font-display font-bold text-lg">Próximos rituais das casas</h2>
          {realFiltered.map((r) => (
            <PromoTrack key={r.id} promoId={promo.idByItem.get(r.id)}>
            <Card className="lift overflow-hidden">
              <div className="flex items-stretch gap-3 p-3 sm:p-4">
                <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-forest/10 py-2 text-center text-forest" aria-hidden>
                  <div>
                    <div className="font-display text-2xl font-bold leading-none">{new Date(r.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" })}</div>
                    <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide">{new Date(r.startsAt).toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "")}</div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-base leading-snug break-words">{r.title}{promo.boostedIds.has(r.id) && <span className="ml-2 rounded-full border border-current/30 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Promovido</span>}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground break-words">
                    {r.houseName} · {modeLabel(r.mode)} · {new Date(r.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone="muted">{seatsLeft(r.seatsTotal, r.taken)} vagas</Badge>
                    <Badge tone="gold">{formatCents(r.priceCents)}</Badge>
                  </div>
                </div>
              </div>
              {r.ownerId && (
                <Link to={`/casa/${r.ownerId}?aba=rituais`} className="flex min-h-11 items-center justify-center border-t border-border/70 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">Ver e reservar</Link>
              )}
            </Card>
            </PromoTrack>
          ))}
        </section>
      )}

      <div className="space-y-3">
        {filtered.map((r) => (
          <RitualCard key={r.id} ritual={r} />
        ))}
        {(isRemoteAuth ? realFiltered.length === 0 : filtered.length === 0) && (
          <Card className="p-10 text-center text-muted-foreground">
            {isRemoteAuth && real.length === 0 ? "Ainda não há rituais publicados." : "Nenhum ritual encontrado com esses filtros."}
          </Card>
        )}
      </div>
    </div>
  );
}
