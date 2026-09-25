import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import RitualCard from "@/components/feed/RitualCard";
import { Card, Input, Badge } from "@/components/base";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Todos", "prosperidade", "amor", "cura", "proteção", "justiça", "consulta"];
const MODES = ["Todos", "presencial", "distancia", "hibrido"] as const;

export default function Rituals() {
  const { rituals } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todos");
  const [mode, setMode] = useState<typeof MODES[number]>("Todos");

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
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40 relative overflow-hidden">
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="h-5 w-5 text-gold" />
          <h1 className="font-display font-bold text-2xl">Rituais & Trabalhos</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Encontre rituais coletivos e trabalhos personalizados oferecidos pelas casas. Vagas atualizadas em tempo real.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por título, ervas, orixá..." className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition",
                cat === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition",
                mode === m ? "bg-forest text-forest-foreground border-forest" : "border-border hover:bg-muted"
              )}
            >
              {m === "distancia" ? "à distância" : m}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((r) => (
          <RitualCard key={r.id} ritual={r} />
        ))}
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">Nenhum ritual encontrado com esses filtros.</Card>
        )}
      </div>
    </div>
  );
}
