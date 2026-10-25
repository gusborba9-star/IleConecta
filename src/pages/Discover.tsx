import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Card, Input } from "@/components/base";
import { CheckCircle2, Compass, MapPin, Search, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Discover() {
  const { users } = useApp();
  const houses = users.filter((u) => u.type === "commercial") as any[];
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("Todas");

  const tags = ["Todas", "Candomblé Ketu", "Umbanda", "Umbanda Omolokô", "Candomblé Nagô"];

  const filtered = useMemo(() => {
    return houses.filter((h) => {
      if (tag !== "Todas" && h.category !== tag) return false;
      if (q && !h.name.toLowerCase().includes(q.toLowerCase()) && !h.city.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [houses, tag, q]);

  const promoted = filtered.filter((h) => h.boost);
  const rest = filtered.filter((h) => !h.boost);

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

      <section>
        <h2 className="font-display font-bold text-lg mb-2">Casas da comunidade</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rest.map((h) => (
            <HouseTile key={h.id} h={h} />
          ))}
          {filtered.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-2">Nenhuma casa encontrada.</Card>}
        </div>
      </section>
    </div>
  );
}

function HouseTile({ h }: { h: any }) {
  return (
    <Link to={`/casa/${h.id}`} className="block">
      <Card className="overflow-hidden hover:shadow-altar transition">
        <div className="relative h-28">
          <img src={h.cover} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {h.boost && (
            <Badge tone="gold" className="absolute top-2 right-2">
              <TrendingUp className="h-3 w-3" /> {h.boost.level}
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
              <span>·</span>
              <span className="flex items-center gap-1"><Star className="h-3 w-3 text-gold fill-gold" /> {h.rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
