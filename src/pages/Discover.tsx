import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Card, Input } from "@/components/base";
import { CheckCircle2, Compass, MapPin, Search, Star, TrendingUp } from "lucide-react";
import { cn, isPromotionActive } from "@/lib/utils";
import type { HouseUser } from "@/types";
import RitualCard from "@/components/feed/RitualCard";
import { matchesDemoSearch } from "@/lib/demoState";
import { fetchFeatured } from "@/lib/referral";

export default function Discover() {
  const { users, rituals, isRemoteAuth } = useApp();
  // Destaque ganho no Indique e ganhe (id da casa -> fim do prêmio).
  const [featured, setFeatured] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchFeatured().then((f) => alive && setFeatured(f));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth]);
  const [searchParams] = useSearchParams();
  const houses = users.filter((u): u is HouseUser => u.type === "commercial");
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [tag, setTag] = useState("Todas");

  useEffect(() => setQ(searchParams.get("q") ?? ""), [searchParams]);

  const tags = ["Todas", "Candomblé Ketu", "Umbanda", "Umbanda Omolokô", "Candomblé Nagô"];

  const filtered = useMemo(() => {
    return houses.filter((h) => {
      if (tag !== "Todas" && h.category !== tag) return false;
      if (q && !matchesDemoSearch(q, [h.name, h.city, h.state, h.category, h.bio, ...h.tags])) return false;
      return true;
    });
  }, [houses, tag, q]);

  const matchingRituals = q.trim()
    ? rituals.filter((ritual) => {
        const house = users.find((user) => user.id === ritual.houseId);
        const houseCategory = house?.type === "commercial" ? house.category : "";
        return matchesDemoSearch(q, [ritual.title, ritual.description, ritual.category, house?.name, houseCategory]);
      })
    : [];

  const isUp = (h: HouseUser) => isPromotionActive(h.boost?.expiresAt) || Boolean(featured[h.id]);
  const promoted = filtered.filter(isUp);
  const rest = filtered.filter((h) => !isUp(h));

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Compass className="h-5 w-5 text-forest" />
          <h1 className="font-display font-bold text-2xl">Descobrir casas</h1>
        </div>
        <p className="text-sm text-muted-foreground">Explore casas por cidade, categoria e propósito.</p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Buscar por nome ou cidade" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition",
                tag === t ? "bg-forest text-forest-foreground border-forest shadow-card" : "border-border bg-card hover:bg-muted"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {promoted.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-display font-bold text-lg">Impulsionadas e em destaque</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {promoted.map((h) => (
              <HouseTile key={h.id} h={h} featured={Boolean(featured[h.id])} />
            ))}
          </div>
        </section>
      )}

      {q.trim() && matchingRituals.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg mb-2">Rituais relacionados</h2>
          <div className="space-y-3">
            {matchingRituals.map((ritual) => <RitualCard key={ritual.id} ritual={ritual} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display font-bold text-lg mb-2">Casas da comunidade</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rest.map((h) => (
            <HouseTile key={h.id} h={h} featured={Boolean(featured[h.id])} />
          ))}
          {filtered.length === 0 && !q.trim() && <Card className="p-8 text-center text-muted-foreground md:col-span-2">Nenhuma casa encontrada.</Card>}
        </div>
      </section>

      {q.trim() && filtered.length === 0 && matchingRituals.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">Nenhuma casa ou ritual encontrado para “{q.trim()}”.</Card>
      )}
    </div>
  );
}

function HouseTile({ h, featured = false }: { h: HouseUser; featured?: boolean }) {
  const activeBoost = isPromotionActive(h.boost?.expiresAt) ? h.boost : undefined;
  const place = [h.city, h.state].filter(Boolean).join(", ");

  return (
    <Link to={`/casa/${h.id}`} className="block group">
      <Card className="lift overflow-hidden">
        <div className="relative h-28 sm:h-32">
          <img src={h.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-forest/55 via-transparent to-transparent" />
          {activeBoost ? (
            <Badge tone="gold" className="absolute top-2 right-2 backdrop-blur">
              <TrendingUp className="h-3 w-3" /> {activeBoost.level}
            </Badge>
          ) : featured && (
            <Badge tone="gold" className="absolute top-2 right-2 backdrop-blur">
              <Star className="h-3 w-3" /> Em destaque
            </Badge>
          )}
        </div>
        <div className="px-4 pb-4">
          {/* A foto de perfil sobe sobre a capa: precisa ficar numa camada acima dela. */}
          <div className="flex items-end justify-between gap-3 -mt-9">
            <div className="relative z-10 rounded-full p-1 bg-card shadow-card ring-1 ring-gold/60 shrink-0">
              <Avatar src={h.avatar} name={h.name} size={68} />
            </div>
            {h.rating > 0 && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                <Star className="h-3.5 w-3.5 text-gold fill-gold" /> {h.rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <div className="font-display font-bold text-lg leading-snug truncate">{h.name}</div>
            {h.verified && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-label="Casa verificada" />}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{place || "Local não informado"}</span>
          </div>
          {h.category && (
            <div className="mt-2.5">
              <Badge tone="forest">{h.category}</Badge>
            </div>
          )}
          {h.bio && <p className="mt-2.5 text-sm text-muted-foreground line-clamp-2">{h.bio}</p>}
        </div>
      </Card>
    </Link>
  );
}
