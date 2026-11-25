import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Video } from "lucide-react";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchUpcoming, type UpcomingMeeting } from "@/lib/video";
import { homeMeetingCards } from "@/lib/videoCore";

const hour = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Lugar de destaque na tela inicial: reuniões e consultas por vídeo de hoje (ou de amanhã) com o botão Entrar quando a sala abre. */
export default function UpcomingMeetingCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const [list, setList] = useState<UpcomingMeeting[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => { void fetchUpcoming().then(setList); }, []);
  useEffect(() => {
    if (!isRemoteAuth || !currentUser) return;
    load();
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    const again = window.setInterval(load, 5 * 60_000);
    const onVis = () => { if (document.visibilityState === "visible") { setNow(Date.now()); load(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); window.clearInterval(again); document.removeEventListener("visibilitychange", onVis); };
  }, [isRemoteAuth, currentUser, load]);
  const cards = useMemo(() => homeMeetingCards(list, now), [list, now]);
  if (!isRemoteAuth || !currentUser || cards.length === 0) return null;
  return (
    <section aria-label="Reuniões por vídeo" data-testid="video-home-card" className="space-y-2">
      {cards.map((m) => (
        <Card key={m.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${m.state === "aberta" ? "border-primary/60 bg-primary/5" : ""}`} data-testid="video-home-item">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${m.state === "aberta" ? "bg-primary text-primary-foreground" : "bg-muted text-primary"}`} aria-hidden><Video className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="break-words font-semibold leading-tight">{m.title}</p>
              <p className="text-xs text-muted-foreground">
                {m.state === "aberta" ? "Sala aberta agora" : m.state === "hoje" ? `Hoje às ${hour(m.start)}` : `Amanhã às ${hour(m.start)}`} · {m.houseName}{m.kind === "consulta" ? " · Consulta" : ""}
              </p>
            </div>
          </div>
          {m.state === "aberta"
            ? <Link to={`/reunioes/${m.id}`} className="inline-flex min-h-11 items-center rounded-[14px] bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" data-testid="video-home-enter">Entrar na sala</Link>
            : <Link to="/reunioes" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary">Ver reunião</Link>}
        </Card>
      ))}
    </section>
  );
}
