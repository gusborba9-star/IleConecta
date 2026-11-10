import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import RitualCard from "@/components/feed/RitualCard";
import { Card, Input, Badge } from "@/components/base";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todos");
  const [mode, setMode] = useState<typeof MODES[number]>("Todos");

  const realFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return real.filter((r) => {
      if (mode !== "Todos" && r.mode !== mode) return false;
      if (term && !`${r.title} ${r.description ?? ""} ${r.houseName}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [real, mode, q]);

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
      <Card className="page-hero p-5 relative overflow-hidden">
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="h-5 w-5 text-gold" />
          <h1 className="font-display font-bold text-2xl">Rituais & Trabalhos</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Encontre rituais coletivos e trabalhos personalizados oferecidos pelas casas. {isRemoteAuth ? "Reserve direto com a casa; as vagas são atualizadas em tempo real." : "Dados de demonstração; disponibilidade não é sincronizada entre usuários."}
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por título, tema ou casa..." className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!isRemoteAuth && CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition",
                cat === c ? "bg-forest text-forest-foreground border-forest shadow-card" : "border-border bg-card hover:bg-muted"
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

      {isRemoteAuth && realFiltered.length > 0 && (
        <section aria-label="Rituais das casas" className="space-y-3">
          <h2 className="font-display font-bold text-lg">Próximos rituais das casas</h2>
          {realFiltered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.houseName} · {modeLabel(r.mode)} · {new Date(r.startsAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} · {seatsLeft(r.seatsTotal, r.taken)} vagas · {formatCents(r.priceCents)}
                  </div>
                </div>
                {r.ownerId && (
                  <Link to={`/casa/${r.ownerId}?aba=rituais`} className="text-sm font-semibold text-primary underline">Ver e reservar</Link>
                )}
              </div>
            </Card>
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
