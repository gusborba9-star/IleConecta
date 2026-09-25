import type { Ritual } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { Badge, Button, Progress } from "@/components/base";
import { formatBRL } from "@/lib/utils";
import { CalendarDays, MapPin, Ticket, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function RitualCard({ ritual, compact }: { ritual: Ritual; compact?: boolean }) {
  const { getHouse, currentUser } = useApp();
  const nav = useNavigate();
  const house = getHouse(ritual.houseId);
  const remaining = ritual.vagasTotal - ritual.vagasVendidas;
  const pct = (ritual.vagasVendidas / ritual.vagasTotal) * 100;
  const soldOut = remaining <= 0;
  const isClient = currentUser?.type === "personal";

  return (
    <div className={cn("rounded-2xl overflow-hidden bg-card border border-border shadow-card", !compact && "hover:shadow-altar transition")}
    >
      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="relative">
          <img src={ritual.cover} alt="" className={cn("w-full object-cover", compact ? "h-32 md:h-full" : "h-48 md:h-full")} />
          <div className="absolute top-3 left-3 flex gap-2">
            <Badge tone="gold">Ritual</Badge>
            <Badge tone={ritual.mode === "distancia" ? "forest" : "primary"} className="capitalize">
              {ritual.mode === "presencial" ? <><MapPin className="h-3 w-3" /> Presencial</> : ritual.mode === "distancia" ? <><Video className="h-3 w-3" /> À distância</> : "Híbrido"}
            </Badge>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{house?.name} · {house?.city}/{house?.state}</div>
            <h4 className="font-display font-bold text-lg leading-tight mt-1 line-clamp-2">{ritual.title}</h4>
          </div>
          {!compact && <p className="text-sm text-muted-foreground line-clamp-2">{ritual.description}</p>}

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Ticket className="h-3 w-3" /> {ritual.vagasVendidas} / {ritual.vagasTotal} vagas
              </span>
              <span className={cn("font-semibold", remaining < 20 ? "text-primary" : "text-muted-foreground")}>
                {soldOut ? "Esgotado" : `${remaining} restantes`}
              </span>
            </div>
            <Progress value={pct} tone={pct > 85 ? "primary" : "gold"} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Valor da vaga</div>
              <div className="font-display font-bold text-2xl text-primary">{formatBRL(ritual.price)}</div>
            </div>
            {isClient ? (
              <Button onClick={() => nav(`/rituais/${ritual.id}`)} disabled={soldOut}>
                {soldOut ? "Esgotado" : "Ver ritual"}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => nav(`/rituais/${ritual.id}`)}>
                Detalhes
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
