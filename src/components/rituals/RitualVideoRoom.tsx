import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Video } from "lucide-react";
import { Button } from "@/components/base";
import { fetchActivityRoom, houseVideoReady, openActivityRoom } from "@/lib/video";

/**
 * Sala de vídeo da plataforma para ritual à distância (atividade ao vivo): a casa abre a sala e só quem tem vaga CONFIRMADA (paga) entra,
 * passando pela sala de espera. O ingresso, as vagas, a comissão e o reembolso são os do próprio ritual.
 */
export default function RitualVideoRoom({ eventId, houseId, isOwn, active, mine }: { eventId: string; houseId: string; isOwn: boolean; active: boolean; mine: boolean }) {
  const [room, setRoom] = useState<{ id: string; startsAt: string } | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setRoom(await fetchActivityRoom(eventId)); }, [eventId]);
  useEffect(() => {
    if (!active || (!isOwn && !mine)) return;
    void load();
    if (isOwn) void houseVideoReady(houseId).then(setReady);
  }, [active, isOwn, mine, houseId, load]);
  if (!active || (!isOwn && !mine)) return null;
  if (room === undefined) return null;
  const open = async () => {
    setBusy(true);
    const r = await openActivityRoom(eventId);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Não consegui abrir a sala.");
    toast.success("Sala de vídeo aberta. Quem tem vaga confirmada entra por ela.");
    void load();
  };
  if (room) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="ritual-video-room">
        <Video className="h-4 w-4 text-primary" aria-hidden />
        <Link to={`/reunioes/${room.id}`} className="font-semibold text-primary underline">{isOwn ? "Abrir a sala de vídeo" : "Entrar na sala de vídeo"}</Link>
        <span className="text-xs text-muted-foreground">{isOwn ? "A entrada passa pela sala de espera; indique ajudantes e veja a presença em Reuniões." : "A sala abre 10 minutos antes e a casa libera a sua entrada."}</span>
      </div>
    );
  }
  if (!isOwn || !ready) return null;
  return (
    <div className="mt-3" data-testid="ritual-video-open">
      <Button size="sm" variant="outline" onClick={() => void open()} disabled={busy}><Video className="mr-1.5 h-4 w-4" aria-hidden />{busy ? "Abrindo…" : "Abrir sala de vídeo da plataforma"}</Button>
      <p className="mt-1 text-xs text-muted-foreground">Plano Plus. A sala fica liberada só para quem tem vaga confirmada, com sala de espera, e consome os minutos de vídeo do mês.</p>
    </div>
  );
}
