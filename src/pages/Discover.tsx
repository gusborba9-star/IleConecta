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
    <Link to={`/casa/${h.id}`} className="block">
      <Card className="overflow-hidden hover:shadow-altar transition">
        <div className="relative h-28">
          <img src={h.cover} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {activeBoost && (
            <Badge tone="gold" className="absolute top-2 right-2">
              <TrendingUp className="h-3 w-3" /> {activeBoost.level}
            </Badge>
          )}
        </div>
        <div className="p-4 flex items-start gap-3 -mt-6">
          <Avatar src={h.avatar} name={h.name} size={56} ring="gold" />
          <div className="flex-1 min-w-0 pt-6">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="font-display font-bold truncate">{h.name}</div>
              {h.verified && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {h.city}, {h.state}</span>
              <span>·</span>
              <span>{h.category}</span>
              {h.rating > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 text-gold fill-gold" /> {h.rating.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
