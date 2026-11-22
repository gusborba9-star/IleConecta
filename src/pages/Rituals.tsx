import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import RitualCard from "@/components/feed/RitualCard";
import { Card, Input, Badge } from "@/components/base";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import PromoTrack from "@/components/promo/PromoTrack";
import { usePromoRanking } from "@/lib/usePromoRanking";
import { fetchRitualCatalog, fetchTakenMany, type CatalogRitual } from "@/lib/rituals";
import { fetchReviewSummary } from "@/lib/reviews";
import RitualFilters from "@/components/feed/RitualFilters";
import LocationPrompt from "@/components/profile/LocationPrompt";
import { applyFilters, facets as buildFacets, fromParams, toParams, splitBoosted, activeCount, EMPTY, type FilterState } from "@/lib/ritualFiltersCore.js";
import { modeLabel, seatsLeft } from "@/lib/ritualsCore";
import { formatCents } from "@/lib/servicesCore";

const CATEGORIES = ["Todos", "prosperidade", "amor", "cura", "proteção", "justiça", "consulta"];
const MODES = ["Todos", "presencial", "distancia", "hibrido"] as const;

export default function Rituals() {
  const { rituals, isRemoteAuth, currentUser } = useApp();
  const promo = usePromoRanking(isRemoteAuth);
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => fromParams(params), [params]);
  const setFilters = (f: FilterState) => {
    const next = toParams(f);
    const q0 = params.get("q");
    if (q0) next.set("q", q0);
    setParams(next, { replace: true });
  };
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [cat, setCat] = useState("Todos");
  const [mode, setMode] = useState<typeof MODES[number]>("Todos");

  // Catálogo: todos os rituais publicados (até 500, os mais próximos primeiro), sem as vagas; as vagas vêm só do que aparece.
  const [catalog, setCatalog] = useState<{ items: CatalogRitual[]; total: number } | null>(null);
  const [taken, setTaken] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [shown, setShown] = useState(20);
  const boostedKey = [...promo.boostedIds].sort().join(",");
  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchRitualCatalog([...promo.boostedIds]).then((c) => alive && setCatalog(c));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemoteAuth, boostedKey]);
  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchReviewSummary().then((r) => alive && setRatings(r));
    return () => { alive = false; };
  }, [isRemoteAuth]);

  const real = useMemo(() => catalog?.items ?? [], [catalog]);
  const ratingOf = (o: string | null) => (o ? ratings[o]?.avg ?? 0 : 0);
  const ctx = { taken, rating: ratingOf };
  // A busca por texto vem antes dos filtros; os impulsionados que combinam vão na frente e não entram na contagem do orgânico.
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    return real.filter((r) => !term || `${r.title} ${r.description ?? ""} ${r.houseName}`.toLowerCase().includes(term));
  }, [real, q]);
  const facetList = useMemo(() => buildFacets(searched, filters, ctx), [searched, filters, taken, ratings]); // eslint-disable-line react-hooks/exhaustive-deps
  const matched = useMemo(() => applyFilters(searched, filters, ctx), [searched, filters, taken, ratings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { boosted, organic } = useMemo(() => splitBoosted(matched, promo.boostedIds), [matched, promo.boostedIds]);
  const realFiltered = useMemo(() => [...boosted, ...organic], [boosted, organic]);
  const visible = useMemo(() => [...boosted, ...organic.slice(0, shown)], [boosted, organic, shown]);

  // Vagas do que aparece e, para a faixa "Com vaga", das 100 primeiras opções que passam nos outros filtros.
  useEffect(() => {
    if (!isRemoteAuth || !catalog) return;
    const base = applyFilters(searched, { ...filters, vaga: false }, ctx).slice(0, 100);
    const need = [...new Set([...visible.map((r) => r.id), ...base.map((r) => r.id)])].filter((id) => taken[id] === undefined);
    if (need.length === 0) return;
    let alive = true;
    void fetchTakenMany(need).then((t) => alive && setTaken((prev) => ({ ...prev, ...t })));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemoteAuth, catalog, searched, visible.length]);
  const capped = (catalog?.total ?? 0) > real.length;

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
        {isRemoteAuth ? (
          <RitualFilters facets={facetList} value={filters} onChange={(f) => { setShown(20); setFilters(f); }} />
        ) : (
        <div className="scroll-x -mx-1 mt-2 flex gap-1.5 px-1 whitespace-nowrap" role="group" aria-label="Filtrar por modalidade">
          {MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={cn("shrink-0 min-h-9 px-3.5 rounded-full text-xs font-semibold capitalize border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m ? "bg-forest text-forest-foreground border-forest shadow-card" : "border-border bg-card hover:bg-muted")}>
              {m === "distancia" ? "à distância" : m}
            </button>
          ))}
          </div>
        )}
      </Card>

      {currentUser?.type === "personal" && <LocationPrompt />}

      {isRemoteAuth && catalog && (
        <p className="px-1 text-sm text-muted-foreground" role="status">
          {organic.length} {organic.length === 1 ? "ritual" : "rituais"}{boosted.length > 0 ? ` · ${boosted.length} impulsionado${boosted.length === 1 ? "" : "s"}` : ""}{activeCount(filters) > 0 || q.trim() ? " com esses filtros" : ""}{capped ? ` · mostrando os ${real.length} mais próximos de ${catalog.total}` : ""}
        </p>
      )}

      {isRemoteAuth && realFiltered.length > 0 && (
        <section aria-label="Rituais das casas" className="space-y-3">
          <h2 className="font-display font-bold text-lg">Próximos rituais das casas</h2>
          {visible.map((r) => (
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
                    <Badge tone="muted">{taken[r.id] === undefined ? "Vagas…" : `${seatsLeft(r.seatsTotal, taken[r.id])} vagas`}</Badge>
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
          {organic.length > shown && <button type="button" onClick={() => setShown((n) => n + 20)} className="min-h-11 w-full rounded-full border border-border text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Ver mais rituais</button>}
        </section>
      )}

      <div className="space-y-3">
        {filtered.map((r) => (
          <RitualCard key={r.id} ritual={r} />
        ))}
        {(isRemoteAuth ? catalog !== null && realFiltered.length === 0 : filtered.length === 0) && (
          <Card className="p-10 text-center text-muted-foreground">
            {isRemoteAuth && real.length === 0 ? "Ainda não há rituais publicados." : "Nenhum ritual encontrado com esses filtros."}
            {isRemoteAuth && real.length > 0 && (activeCount(filters) > 0) && <button type="button" onClick={() => setFilters({ ...EMPTY })} className="mt-2 block min-h-11 w-full text-sm font-semibold text-primary hover:underline">Limpar filtros</button>}
          </Card>
        )}
      </div>
    </div>
  );
}
