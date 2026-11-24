import { Link } from "react-router-dom";
import { Video } from "lucide-react";
import { formatWhen, meetingPhase } from "@/lib/videoCore";
import type { OrderMeeting } from "@/lib/video";

/** Consultas por vídeo do pedido: horário, "Entrar" quando a sala abre e, para a casa, o atalho para marcar. */
export default function OrderVideo({ meetings, schedulable, orderId }: { meetings: OrderMeeting[]; schedulable?: boolean; orderId: string }) {
  if (meetings.length === 0 && !schedulable) return null;
  return (
    <div className="mt-2 space-y-1" data-testid="order-video">
      {meetings.map((m) => {
        const phase = meetingPhase({ startsAt: m.startsAt, durationMin: m.durationMin });
        return (
          <p key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Video className="h-4 w-4 text-primary" aria-hidden />
            <span><span className="text-muted-foreground">Consulta por vídeo: </span><strong>{formatWhen(m.startsAt)}</strong> · {m.durationMin} min</span>
            {phase === "aberta" ? <Link to={`/reunioes/${m.id}`} className="font-semibold text-primary hover:underline">Entrar</Link>
              : <span className="text-xs text-muted-foreground">{phase === "cedo" ? "A sala abre 10 min antes" : "Encerrada"}</span>}
          </p>
        );
      })}
      {schedulable && <Link to={`/reunioes?pedido=${orderId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><Video className="h-4 w-4" aria-hidden />{meetings.length ? "Marcar outra consulta por vídeo" : "Marcar consulta por vídeo"}</Link>}
    </div>
  );
}
