import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { joinMeeting, type JoinResult } from "@/lib/video";
import { embedUrl, joinReasonText } from "@/lib/videoCore";

type State = { s: "carregando" } | { s: "negado"; text: string } | { s: "pronta"; src: string; title: string };

/** Sala de vídeo: o servidor confere o acesso e devolve o endereço da sala; só endereços dos dois provedores entram no quadro. */
export default function Sala() {
  const { id = "" } = useParams();
  const { currentUser, isRemoteAuth } = useApp();
  const [st, setSt] = useState<State>({ s: "carregando" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt({ s: "carregando" });
    void joinMeeting(id).then((r: JoinResult) => {
      if (!alive) return;
      if (!r.ok) return setSt({ s: "negado", text: joinReasonText(r.reason, r.startsAt) });
      const src = embedUrl(r.provider ?? "", r.url ?? "", r.token);
      setSt(src ? { s: "pronta", src, title: r.title ?? "Reunião" } : { s: "negado", text: joinReasonText("provedor_indisponivel") });
    });
    return () => { alive = false; };
  }, [id, tick]);
  if (!currentUser || !isRemoteAuth) return <Navigate to="/" replace />;
  return (
    <div className="space-y-3 pb-16 lg:pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 break-words font-display text-xl font-bold">{st.s === "pronta" ? st.title : "Reunião por vídeo"}</h1>
        <Link to="/reunioes" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">Sair da sala</Link>
      </div>
      {st.s === "carregando" && <Card className="p-5 text-sm text-muted-foreground" role="status">Preparando a sala…</Card>}
      {st.s === "negado" && (
        <Card className="space-y-3 p-5" role="alert">
          <p className="text-sm">{st.text}</p>
          <Button variant="outline" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>
        </Card>
      )}
      {st.s === "pronta" && (
        <iframe title={st.title} src={st.src} allow="camera; microphone; fullscreen; display-capture; autoplay" referrerPolicy="strict-origin-when-cross-origin"
          className="h-[78vh] w-full rounded-2xl border border-border bg-black" data-testid="video-frame" />
      )}
    </div>
  );
}
