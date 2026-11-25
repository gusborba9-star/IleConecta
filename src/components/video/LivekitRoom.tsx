import { useCallback, useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useChat, useConnectionState, useDataChannel, useParticipants, useRoomContext, useTrackToggle, useTracks, isTrackReference, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { ConnectionState, DisconnectReason, RoomEvent, Track, MediaDeviceFailure, type Participant } from "livekit-client";
import { MessageSquare, Mic, MicOff, Monitor, PhoneOff, Users, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { removeFromRoom } from "@/lib/video";

/** Sala "Premium" (LiveKit): grade de pessoas, botões grandes de toque, rótulos em português e foco automático em quem compartilha a tela. */
export interface LivekitRoomProps { serverUrl: string; token: string; onLeave: (removed?: boolean) => void; meetingId?: string; isHost?: boolean }

const isHostP = (p?: Participant | null) => { try { return JSON.parse(p?.metadata || "{}").host === true; } catch { return false; } };
const MODE_TOPIC = "ile-chat-mode";

const initials = (n: string) => (n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?");

function Tile({ t, big }: { t: TrackReferenceOrPlaceholder; big?: boolean }) {
  const name = t.participant.name || "Participante";
  const hasVideo = isTrackReference(t) && !t.publication.isMuted;
  const micOff = !t.participant.isMicrophoneEnabled;
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-neutral-900 ${big ? "h-full min-h-0" : "aspect-[3/4] sm:aspect-video"}`} data-testid="lk-tile" aria-label={`${name}${micOff ? ", microfone desligado" : ""}`}>
      {hasVideo
        ? <VideoTrack trackRef={t} className={`h-full w-full ${t.source === Track.Source.ScreenShare ? "object-contain" : "object-cover"}`} />
        : <div className="flex h-full w-full items-center justify-center"><span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 font-display text-2xl font-bold text-primary-foreground" aria-hidden>{initials(name)}</span></div>}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-sm font-medium text-white">
        {micOff && <MicOff className="h-4 w-4 shrink-0 text-red-300" aria-hidden />}
        <span className="truncate">{name}{t.participant.isLocal ? " (você)" : ""}{t.source === Track.Source.ScreenShare ? " · tela" : ""}</span>
      </div>
    </div>
  );
}

function Stage() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const share = tracks.find((t) => t.source === Track.Source.ScreenShare && isTrackReference(t));
  const cams = tracks.filter((t) => t.source === Track.Source.Camera);
  const key = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}-${t.source}`;
  if (share) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-2">
        <div className="min-h-0 flex-1"><Tile t={share} big /></div>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Participantes">{cams.map((t) => <div key={key(t)} className="w-28 shrink-0"><Tile t={t} /></div>)}</div>
      </div>
    );
  }
  const cols = cams.length <= 1 ? "grid-cols-1" : cams.length <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";
  const rows = cams.length <= 1 ? "grid-rows-1" : cams.length <= 4 ? "grid-rows-2 sm:grid-rows-2" : "";
  return <div className={`grid h-full min-h-0 auto-rows-fr gap-2 p-2 ${cols} ${rows}`}>{cams.map((t) => <div key={key(t)} className="min-h-0"><Tile t={t} big /></div>)}</div>;
}

const btn = "relative inline-flex min-h-14 min-w-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function Controls({ onLeave, chatOpen, onChat, unread, isHost, peopleOpen, onPeople }: { onLeave: () => void; chatOpen: boolean; onChat: () => void; unread: number; isHost: boolean; peopleOpen: boolean; onPeople: () => void }) {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const scr = useTrackToggle({ source: Track.Source.ScreenShare });
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const on = "bg-muted text-foreground", off = "bg-destructive/10 text-destructive";
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border bg-card px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2" role="toolbar" aria-label="Controles da chamada">
      <button type="button" className={`${btn} ${mic.enabled ? on : off}`} onClick={() => mic.toggle()} aria-pressed={mic.enabled} data-testid="lk-mic">
        {mic.enabled ? <Mic className="h-6 w-6" aria-hidden /> : <MicOff className="h-6 w-6" aria-hidden />}{mic.enabled ? "Microfone" : "Mudo"}
      </button>
      <button type="button" className={`${btn} ${cam.enabled ? on : off}`} onClick={() => cam.toggle()} aria-pressed={cam.enabled} data-testid="lk-cam">
        {cam.enabled ? <Video className="h-6 w-6" aria-hidden /> : <VideoOff className="h-6 w-6" aria-hidden />}{cam.enabled ? "Câmera" : "Sem câmera"}
      </button>
      {canShare && (
        <button type="button" className={`${btn} ${scr.enabled ? "bg-primary text-primary-foreground" : on}`} onClick={() => scr.toggle()} aria-pressed={scr.enabled} data-testid="lk-share">
          <Monitor className="h-6 w-6" aria-hidden />{scr.enabled ? "Parar tela" : "Mostrar tela"}
        </button>
      )}
      <button type="button" className={`${btn} ${chatOpen ? "bg-primary text-primary-foreground" : on}`} onClick={onChat} aria-pressed={chatOpen} data-testid="lk-chat">
        <MessageSquare className="h-6 w-6" aria-hidden />Chat
        {unread > 0 && !chatOpen && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-destructive px-1 text-[11px] leading-5 text-destructive-foreground" aria-label={`${unread} mensagens novas`}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {isHost && (
        <button type="button" className={`${btn} ${peopleOpen ? "bg-primary text-primary-foreground" : on}`} onClick={onPeople} aria-pressed={peopleOpen} data-testid="lk-people">
          <Users className="h-6 w-6" aria-hidden />Pessoas
        </button>
      )}
      <button type="button" className={`${btn} bg-destructive text-destructive-foreground`} onClick={() => onLeave()} data-testid="lk-leave">
        <PhoneOff className="h-6 w-6" aria-hidden />Sair
      </button>
    </div>
  );
}

/** Chat da sala: some quando a reunião acaba (nada é guardado). A casa pode deixar só ela escrevendo; quem recebe confere quem é a casa. */
function ChatPanel({ isHost, hostOnly, onHostOnly, onClose }: { isHost: boolean; hostOnly: boolean; onHostOnly: (v: boolean) => void; onClose: () => void }) {
  const { chatMessages, send, isSending } = useChat();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const shown = chatMessages.filter((m) => !hostOnly || m.from?.isLocal || isHostP(m.from));
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [shown.length]);
  const canWrite = isHost || !hostOnly;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim().slice(0, 500);
    if (!t || !canWrite) return;
    setText("");
    await send(t);
  };
  return (
    <section className="flex max-h-[55%] min-h-40 flex-col border-t border-border bg-card" aria-label="Chat da sala" data-testid="lk-chat-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-sm font-semibold">Chat da sala</h2>
        <div className="flex items-center gap-2">
          {isHost && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={hostOnly} onChange={(e) => onHostOnly(e.target.checked)} data-testid="lk-chat-host-only" /> Só a casa escreve
            </label>
          )}
          <button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold hover:bg-muted" onClick={onClose}>Fechar</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-2" aria-live="polite">
        {shown.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma mensagem. O chat some quando a reunião termina.</p>}
        {shown.map((m, i) => (
          <div key={`${m.timestamp}-${i}`} className="text-sm"><strong className={isHostP(m.from) ? "text-gold-ink" : ""}>{m.from?.isLocal ? "Você" : m.from?.name || "Participante"}{isHostP(m.from) ? " (casa)" : ""}:</strong> <span className="break-words">{m.message}</span></div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => void submit(e)} className="flex gap-2 border-t border-border p-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} disabled={!canWrite} aria-label="Mensagem do chat" placeholder={canWrite ? "Escreva uma mensagem" : "Só a casa escreve nesta reunião"} className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60" data-testid="lk-chat-input" />
        <button type="submit" disabled={!canWrite || isSending || !text.trim()} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="lk-chat-send">Enviar</button>
      </form>
    </section>
  );
}

/** Lista de quem está na sala, só para a casa: retirar alguém (a pessoa não volta àquela reunião). */
function PeoplePanel({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const people = useParticipants().filter((p) => !p.isLocal);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async (p: Participant) => {
    setBusy(true);
    const r = await removeFromRoom(meetingId, p.identity);
    setBusy(false);
    setConfirm(null);
    if (r.ok) toast.success(`${p.name || "Participante"} foi removido(a) da reunião.`); else toast.error("Não consegui remover agora. Tente de novo.");
  };
  return (
    <section className="flex max-h-[55%] min-h-32 flex-col border-t border-border bg-card" aria-label="Pessoas na sala" data-testid="lk-people-panel">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">Pessoas na sala ({people.length})</h2>
        <button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold hover:bg-muted" onClick={onClose}>Fechar</button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {people.length === 0 && <li className="text-xs text-muted-foreground">Ninguém além de você na sala.</li>}
        {people.map((p) => (
          <li key={p.identity} className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm" data-testid="lk-person">
            <span className="min-w-0 flex-1 truncate">{p.name || "Participante"}</span>
            {confirm === p.identity ? (
              <>
                <button type="button" disabled={busy} onClick={() => void remove(p)} className="min-h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground" data-testid="lk-remove-confirm">Remover mesmo</button>
                <button type="button" onClick={() => setConfirm(null)} className="min-h-9 rounded-lg px-2 text-xs font-semibold hover:bg-muted">Voltar</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirm(p.identity)} className="min-h-9 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive" data-testid="lk-remove">Remover</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Controle do modo "só a casa escreve": a casa avisa a sala (e quem entra depois); quem recebe só aceita de quem tem a marca de casa. */
function useChatMode(isHost: boolean) {
  const room = useRoomContext();
  const [hostOnly, setHostOnly] = useState(false);
  const modeRef = useRef(false);
  const broadcast = useCallback((v: boolean) => {
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ hostOnly: v })), { reliable: true, topic: MODE_TOPIC });
  }, [room]);
  useDataChannel(MODE_TOPIC, (msg) => {
    if (!isHostP(msg.from)) return;
    try { const v = JSON.parse(new TextDecoder().decode(msg.payload)).hostOnly === true; modeRef.current = v; setHostOnly(v); } catch { /* mensagem inválida: ignora */ }
  });
  useEffect(() => {
    if (!isHost) return;
    const onJoin = () => broadcast(modeRef.current);
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => { room.off(RoomEvent.ParticipantConnected, onJoin); };
  }, [room, isHost, broadcast]);
  const set = (v: boolean) => { modeRef.current = v; setHostOnly(v); if (isHost) broadcast(v); };
  return { hostOnly, set };
}

function Status() {
  const s = useConnectionState();
  if (s === ConnectionState.Connected) return null;
  const text = s === ConnectionState.Reconnecting ? "Conexão instável, reconectando…" : s === ConnectionState.Connecting ? "Conectando à sala…" : "Desconectado.";
  return <p className="bg-amber-100 px-3 py-1.5 text-center text-xs font-medium text-amber-900" role="status">{text}</p>;
}

function Inside({ onLeave, meetingId, isHost }: { onLeave: () => void; meetingId?: string; isHost: boolean }) {
  const [panel, setPanel] = useState<"chat" | "people" | null>(null);
  const { chatMessages } = useChat();
  const mode = useChatMode(isHost);
  const [seen, setSeen] = useState(0);
  useEffect(() => { if (panel === "chat") setSeen(chatMessages.length); }, [panel, chatMessages.length]);
  const unread = Math.max(0, chatMessages.filter((m) => !m.from?.isLocal && (!mode.hostOnly || isHostP(m.from))).length - Math.min(seen, chatMessages.length));
  return (
    <>
      <div className="min-h-0 flex-1"><Stage /></div>
      <RoomAudioRenderer />
      {panel === "chat" && <ChatPanel isHost={isHost} hostOnly={mode.hostOnly} onHostOnly={mode.set} onClose={() => setPanel(null)} />}
      {panel === "people" && isHost && meetingId && <PeoplePanel meetingId={meetingId} onClose={() => setPanel(null)} />}
      <Controls onLeave={onLeave} chatOpen={panel === "chat"} onChat={() => setPanel(panel === "chat" ? null : "chat")} unread={unread} isHost={isHost && Boolean(meetingId)} peopleOpen={panel === "people"} onPeople={() => setPanel(panel === "people" ? null : "people")} />
    </>
  );
}

export default function LivekitRoomView({ serverUrl, token, onLeave, meetingId, isHost = false }: LivekitRoomProps) {
  const [mediaError, setMediaError] = useState<string | null>(null);
  const onFail = (f?: MediaDeviceFailure) => {
    setMediaError(f === MediaDeviceFailure.PermissionDenied ? "Permita o uso da câmera e do microfone no navegador para participar com áudio e vídeo." : f === MediaDeviceFailure.NotFound ? "Não encontrei câmera ou microfone neste aparelho." : "Não consegui acessar a câmera ou o microfone.");
  };
  return (
    <LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={(reason) => onLeave(reason === DisconnectReason.PARTICIPANT_REMOVED)} onMediaDeviceFailure={onFail} data-lk-theme="default" className="flex h-full min-h-0 flex-col bg-black">
      <Status />
      {mediaError && <p className="bg-amber-100 px-3 py-2 text-center text-xs font-medium text-amber-900" role="alert">{mediaError}</p>}
      <Inside onLeave={onLeave} meetingId={meetingId} isHost={isHost} />
    </LiveKitRoom>
  );
}
