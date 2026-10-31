import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Card, Input } from "@/components/base";
import { CheckCircle2, Compass, MapPin, Search, Star, TrendingUp } from "lucide-react";
import { cn, isPromotionActive } from "@/lib/utils";
import type { HouseUser } from "@/types";
import RitualCard from "@/components/feed/RitualCard";
import { matchesDemoSearch } from "@/lib/demoState";

export default function Discover() {
  const { users, rituals } = useApp();
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

  const promoted = filtered.filter((h) => isPromotionActive(h.boost?.expiresAt));
  const rest = filtered.filter((h) => !isPromotionActive(h.boost?.expiresAt));

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Descobrir casas</h1>
        </div>
        <p className="text-sm text-muted-foreground">Explore casas por tradição, cidade e propósito espiritual.</p>
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
                tag === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
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
            <h2 className="font-display font-bold text-lg">Impulsionadas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {promoted.map((h) => (
              <HouseTile key={h.id} h={h} />
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
            <HouseTile key={h.id} h={h} />
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

function HouseTile({ h }: { h: HouseUser }) {
  const activeBoost = isPromotionActive(h.boost?.expiresAt) ? h.boost : undefined;

  return (
    <Link to={`/casa/${h.id}`} className="group block">
      <Card className="overflow-hidden transition hover:shadow-altar hover:-translate-y-0.5">
        <div className="relative h-28">
          <img src={h.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {activeBoost && (
            <Badge tone="gold" className="absolute top-2 right-2">
              <TrendingUp className="h-3 w-3" /> {activeBoost.level}
            </Badge>
          )}
        </div>
        {/* A foto de perfil sobe sobre a capa: precisa de z-index, senão a capa a cobre. */}
        <div className="relative px-4 pb-4">
          <div className="flex items-end justify-between -mt-9">
            <div className="relative z-10 rounded-full p-1 bg-card shadow-card">
              <Avatar src={h.avatar} name={h.name} size={68} className="ring-2 ring-gold" />
            </div>
            {h.rating > 0 && (
              <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Star className="h-3.5 w-3.5 text-gold fill-gold" /> {h.rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="font-display font-bold text-lg leading-tight truncate">{h.name}</div>
            {h.verified && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" aria-label="Casa verificada" />}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{h.city}{h.state ? `, ${h.state}` : ""}</span>
          </div>
          {h.category && <Badge tone="gold" className="mt-2">{h.category}</Badge>}
          {h.bio && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{h.bio}</p>}
        </div>
      </Card>
    </Link>
  );
}
