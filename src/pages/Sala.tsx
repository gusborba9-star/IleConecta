import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { useConfirm } from "@/components/base/Confirm";
import { LEGAL_VERSION } from "@/lib/legalCore";
import { ackMeeting, endMeetingNow, hasAckedMeeting, joinMeeting, requestEntry, type JoinResult } from "@/lib/video";
import WaitingPanel from "@/components/video/WaitingPanel";
import { useWaiting } from "@/lib/useWaiting";
import { Users } from "lucide-react";
import { embedUrl, joinReasonText, livekitServerUrl } from "@/lib/videoCore";

const LivekitRoomView = lazy(() => import("@/components/video/LivekitRoom"));

type State = { s: "checando" } | { s: "aviso" } | { s: "carregando" } | { s: "espera" } | { s: "negado"; text: string } | { s: "pronta"; kind: "iframe"; src: string; title: string; host: boolean; mod: boolean; endsAt?: string } | { s: "pronta"; kind: "livekit"; server: string; token: string; title: string; host: boolean; mod: boolean; endsAt?: string };

/** Sala de vídeo: o servidor confere o acesso e devolve o endereço da sala; só endereços dos dois provedores entram no quadro. */
export default function Sala() {
  const { id = "" } = useParams();
  const { currentUser, isRemoteAuth } = useApp();
  const [st, setSt] = useState<State>({ s: "checando" });
  const [accepted, setAccepted] = useState(false);
  const [acking, setAcking] = useState(false);
  const [tick, setTick] = useState(0);
  const [ending, setEnding] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const end = async () => {
    if (!(await confirm({ title: "Encerrar a reunião?", message: "Todos serão retirados da sala e ela não poderá ser reaberta.", confirmLabel: "Encerrar reunião", danger: true }))) return;
    setEnding(true);
    const r = await endMeetingNow(id);
    setEnding(false);
    if (!r.ok) return void toast.error("Não consegui encerrar. Tente de novo.");
    toast.success(r.roomClosed ? "Reunião encerrada." : "Reunião encerrada. A sala fecha por completo em instantes.");
    navigate("/reunioes");
  };
  const accept = async () => {
    setAcking(true);
    const ok = await ackMeeting(id, LEGAL_VERSION);
    setAcking(false);
    if (!ok) return void toast.error("Não consegui registrar o aceite. Tente de novo.");
    setAccepted(true);
  };
  // Já aceitou esta reunião (na versão atual dos textos)? Então entra direto; senão mostra o aviso.
  useEffect(() => {
    let alive = true;
    void hasAckedMeeting(id, LEGAL_VERSION).then((ok) => { if (!alive) return; if (ok) setAccepted(true); else setSt((c) => (c.s === "checando" ? { s: "aviso" } : c)); });
    return () => { alive = false; };
  }, [id]);
  // Entrada: pede a vaga na sala (com sala de espera a pessoa fica na fila e repetimos o pedido até a casa liberar), depois o servidor devolve o acesso.
  useEffect(() => {
    if (!accepted) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const enter = () => {
      void joinMeeting(id).then((r: JoinResult) => {
        if (!alive) return;
        if (!r.ok) return setSt({ s: "negado", text: joinReasonText(r.reason, r.startsAt) });
        const common = { title: r.title ?? "Reunião", host: r.isHost === true, mod: r.canModerate === true || r.isHost === true, endsAt: r.endsAt };
        if (r.provider === "livekit") {
          const server = livekitServerUrl(r.url ?? "");
          return setSt(server && r.token ? { s: "pronta", kind: "livekit", server, token: r.token, ...common } : { s: "negado", text: joinReasonText("provedor_indisponivel") });
        }
        const src = embedUrl(r.provider ?? "", r.url ?? "", r.token);
        setSt(src ? { s: "pronta", kind: "iframe", src, ...common } : { s: "negado", text: joinReasonText("provedor_indisponivel") });
      });
    };
    const ask = async () => {
      const q = await requestEntry(id);
      if (!alive) return;
      if (q.ok) return enter();
      if (q.reason === "espera") { setSt({ s: "espera" }); timer = setTimeout(() => void ask(), 4000); return; }
      setSt({ s: "negado", text: joinReasonText(q.reason, q.startsAt) });
    };
    setSt({ s: "carregando" });
    void ask();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [id, tick, accepted]);
  const mod = st.s === "pronta" && st.mod;
  const waiting = useWaiting(id, mod);
  const [panelOpen, setPanelOpen] = useState(false);
  if (!currentUser || !isRemoteAuth) return <Navigate to="/" replace />;
  const fim = st.s === "pronta" && st.endsAt && Number.isFinite(Date.parse(st.endsAt)) ? new Date(st.endsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    // Tela cheia: a sala usa toda a largura e a altura visível do celular e a página atrás não rola (a rolagem não disputa com o vídeo).
    <div className="fixed inset-0 z-[45] flex flex-col bg-background" data-testid="video-room" role="region" aria-label="Sala de vídeo">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link to="/reunioes" aria-label="Sair da sala" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ArrowLeft className="h-5 w-5" aria-hidden /><span className="hidden sm:inline">Sair da sala</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-display text-base font-bold leading-tight">{st.s === "pronta" ? st.title : "Reunião por vídeo"}</h1>
          {fim && <p className="text-xs text-muted-foreground">Termina às {fim}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {mod && (
            <button type="button" onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen} className="relative inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary hover:bg-muted" data-testid="video-waiting-toggle">
              <Users className="h-5 w-5" aria-hidden /><span className="hidden sm:inline">Espera</span>
              {waiting.list.length > 0 && <span className="min-w-5 rounded-full bg-destructive px-1 text-center text-[11px] leading-5 text-destructive-foreground" aria-label={`${waiting.list.length} esperando`} data-testid="video-waiting-count">{waiting.list.length}</span>}
            </button>
          )}
          {st.s === "pronta" && st.host
            ? <Button variant="outline" size="sm" onClick={() => void end()} disabled={ending} className="min-h-11 shrink-0 border-destructive text-destructive" data-testid="video-end">{ending ? "Encerrando…" : "Encerrar"}</Button>
            : !mod && <span className="w-11 shrink-0" aria-hidden />}
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        {st.s === "aviso" && (
          <div className="mx-auto mt-6 max-w-md space-y-4 px-4" data-testid="video-aviso">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display text-lg font-bold">Antes de entrar</h2>
              <p className="text-sm leading-relaxed">Esta chamada não é gravada pela plataforma. Ao entrar, você concorda com o tratamento dos seus dados para a realização deste encontro e se compromete a não gravar nem compartilhar imagens ou áudios sem a autorização de todos os participantes.</p>
              <p className="text-xs text-muted-foreground">Veja a <a href="/sobre/privacidade-lgpd" target="_blank" rel="noopener noreferrer" className="text-primary underline">Política de Privacidade (abre em outra aba)</a>.</p>
              <Button className="min-h-12 w-full" onClick={() => void accept()} disabled={acking} data-testid="video-aceitar">{acking ? "Registrando…" : "Concordo e entrar na sala"}</Button>
            </div>
          </div>
        )}
        {(st.s === "carregando" || st.s === "checando") && <p className="p-5 text-sm text-muted-foreground" role="status">Preparando a sala…</p>}
        {st.s === "espera" && (
          <div className="mx-auto mt-6 max-w-md space-y-3 px-4" data-testid="video-espera">
            <div className="space-y-2 rounded-2xl border border-border bg-card p-5" role="status" aria-live="polite">
              <h2 className="font-display text-lg font-bold">Sala de espera</h2>
              <p className="text-sm leading-relaxed">Aguardando a casa liberar a sua entrada. Pode deixar esta tela aberta: você entra sozinho assim que for liberado.</p>
            </div>
          </div>
        )}
        {st.s === "negado" && (
          <div className="m-4 space-y-3 rounded-2xl border border-border bg-card p-5" role="alert">
            <p className="text-sm">{st.text}</p>
            <Button variant="outline" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>
          </div>
        )}
        {st.s === "pronta" && st.kind === "livekit" && (
          <Suspense fallback={<p className="p-5 text-sm text-muted-foreground" role="status">Preparando a sala…</p>}>
            <div className="h-full" data-testid="video-livekit"><LivekitRoomView serverUrl={st.server} token={st.token} meetingId={id} isHost={st.mod} onLeave={(removed) => { if (removed) toast.info("A casa retirou você desta reunião."); navigate("/reunioes"); }} /></div>
          </Suspense>
        )}
        {st.s === "pronta" && st.kind === "iframe" && (
          <iframe title={st.title} src={st.src} allow="camera; microphone; fullscreen; display-capture; autoplay" referrerPolicy="strict-origin-when-cross-origin"
            className="block h-full w-full border-0 bg-black" data-testid="video-frame" />
        )}
        {mod && panelOpen && <WaitingPanel meetingId={id} list={waiting.list} onChanged={() => void waiting.reload()} onClose={() => setPanelOpen(false)} />}
      </main>
    </div>
  );
}
