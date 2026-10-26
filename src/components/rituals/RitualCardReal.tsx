import { useEffect, useState } from "react";
import { CalendarClock, Users } from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/base";
import { fetchStreamUrl, type MyReservation, type RealRitual } from "@/lib/rituals";
import { grossCents, modeLabel, seatsLeft, seatsState } from "@/lib/ritualsCore";
import { formatCents } from "@/lib/servicesCore";

interface Props {
  ritual: RealRitual;
  isOwn: boolean;
  mine?: MyReservation;
  onReserve: () => void;
  onCancelMine: () => void;
  onChat: () => void;
  onAsk?: () => void;
  onEdit: () => void;
  onAttendees: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onStart: () => void;
  onFinish: () => void;
  onCancelRitual: () => void;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const STATUS_LABEL = { rascunho: "Rascunho", publicado: "Publicado", encerrado: "Encerrado", cancelado: "Cancelado" } as const;

export default function RitualCardReal({ ritual: r, isOwn, mine, onReserve, onCancelMine, onChat, onAsk, onEdit, onAttendees, onPublish, onUnpublish, onStart, onFinish, onCancelRitual }: Props) {
  const left = seatsLeft(r.seatsTotal, r.taken);
  const state = seatsState(r.seatsTotal, r.taken);
  const pct = r.seatsTotal ? Math.round((r.taken / r.seatsTotal) * 100) : 0;
  const live = r.startedAt !== null && r.status === "publicado";
  const [stream, setStream] = useState<string | null>(null);
  const canSeeStream = (isOwn || Boolean(mine)) && (r.mode === "distancia" || r.mode === "hibrido");

  useEffect(() => {
    if (!canSeeStream) return setStream(null);
    let alive = true;
    void fetchStreamUrl(r.id).then((u) => alive && setStream(u));
    return () => {
      alive = false;
    };
  }, [r.id, canSeeStream]);

  const open = r.status === "publicado" && !live && new Date(r.startsAt) > new Date();

  return (
    <Card className="p-5">
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-xl">{r.title}</h3>
            <Badge tone="gold">{modeLabel(r.mode)}</Badge>
            {isOwn && <Badge tone="muted">{STATUS_LABEL[r.status]}</Badge>}
            {live && <Badge tone="primary">Em andamento</Badge>}
            {mine && !isOwn && <Badge tone="primary">Você tem vaga</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><CalendarClock className="h-4 w-4" /> {when(r.startsAt)} (Brasília)</p>
          {r.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{r.description}</p>}
          {stream && (
            <a href={stream} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm font-semibold text-primary underline">
              {live ? "Entrar na transmissão agora" : "Link da transmissão"}
            </a>
          )}
        </div>
        <div className="text-right">
          <div className="font-display font-bold text-2xl">{formatCents(r.priceCents)}</div>
          <div className="text-xs text-muted-foreground">por vaga</div>
        </div>
      </div>

      <div className="mt-4" aria-live="polite">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="flex items-center gap-1 font-medium"><Users className="h-4 w-4" /> {r.taken} de {r.seatsTotal} vagas</span>
          <span className={state === "esgotado" ? "font-semibold text-[hsl(var(--danger))]" : state === "ultimas" ? "font-semibold text-primary" : "text-muted-foreground"}>
            {state === "esgotado" ? "Esgotado" : state === "ultimas" ? `Últimas ${left} vagas` : `${left} disponíveis`}
          </span>
        </div>
        <Progress value={pct} tone={state === "abertas" ? "forest" : "primary"} />
        {isOwn && <p className="text-xs text-muted-foreground mt-2">Valor das vagas reservadas: <strong>{formatCents(grossCents(r.priceCents, r.taken))}</strong> (combinado direto com os participantes por enquanto).</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isOwn ? (
          <>
            <Button size="sm" variant="outline" onClick={onAttendees}>Participantes ({r.taken})</Button>
            <Button size="sm" variant="outline" onClick={onEdit}>Editar</Button>
            {r.status === "rascunho" && <Button size="sm" onClick={onPublish}>Publicar</Button>}
            {r.status === "publicado" && !live && <Button size="sm" onClick={onStart}>Iniciar ritual</Button>}
            {r.status === "publicado" && live && <Button size="sm" onClick={onFinish}>Encerrar ritual</Button>}
            {r.status === "publicado" && !live && <Button size="sm" variant="ghost" onClick={onUnpublish}>Voltar a rascunho</Button>}
            {(r.status === "rascunho" || r.status === "publicado") && <Button size="sm" variant="ghost" onClick={onCancelRitual}>Cancelar ritual</Button>}
          </>
        ) : mine ? (
          open && <Button size="sm" variant="outline" onClick={onCancelMine}>Cancelar minha vaga</Button>
        ) : (
          <>
            {open && state !== "esgotado" && <Button size="sm" onClick={onReserve}>Reservar vaga</Button>}
            {onAsk && <Button size="sm" variant="outline" onClick={onAsk}>Perguntar à assistente</Button>}
            <Button size="sm" variant="outline" onClick={onChat}>Conversar com a casa</Button>
          </>
        )}
      </div>
    </Card>
  );
}
