import { useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useConnectionState, useTrackToggle, useTracks, isTrackReference, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { ConnectionState, Track, MediaDeviceFailure } from "livekit-client";
import { Mic, MicOff, Monitor, PhoneOff, Video, VideoOff } from "lucide-react";

/** Sala "Premium" (LiveKit): grade de pessoas, botões grandes de toque, rótulos em português e foco automático em quem compartilha a tela. */
export interface LivekitRoomProps { serverUrl: string; token: string; onLeave: () => void }

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

const btn = "inline-flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function Controls({ onLeave }: { onLeave: () => void }) {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const scr = useTrackToggle({ source: Track.Source.ScreenShare });
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const on = "bg-muted text-foreground", off = "bg-destructive/10 text-destructive";
  return (
    <div className="flex items-center justify-center gap-2 border-t border-border bg-card px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2" role="toolbar" aria-label="Controles da chamada">
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
      <button type="button" className={`${btn} bg-destructive text-destructive-foreground`} onClick={onLeave} data-testid="lk-leave">
        <PhoneOff className="h-6 w-6" aria-hidden />Sair
      </button>
    </div>
  );
}

function Status() {
  const s = useConnectionState();
  if (s === ConnectionState.Connected) return null;
  const text = s === ConnectionState.Reconnecting ? "Conexão instável, reconectando…" : s === ConnectionState.Connecting ? "Conectando à sala…" : "Desconectado.";
  return <p className="bg-amber-100 px-3 py-1.5 text-center text-xs font-medium text-amber-900" role="status">{text}</p>;
}

export default function LivekitRoomView({ serverUrl, token, onLeave }: LivekitRoomProps) {
  const [mediaError, setMediaError] = useState<string | null>(null);
  const onFail = (f?: MediaDeviceFailure) => {
    setMediaError(f === MediaDeviceFailure.PermissionDenied ? "Permita o uso da câmera e do microfone no navegador para participar com áudio e vídeo." : f === MediaDeviceFailure.NotFound ? "Não encontrei câmera ou microfone neste aparelho." : "Não consegui acessar a câmera ou o microfone.");
  };
  return (
    <LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={onLeave} onMediaDeviceFailure={onFail} data-lk-theme="default" className="flex h-full min-h-0 flex-col bg-black">
      <Status />
      {mediaError && <p className="bg-amber-100 px-3 py-2 text-center text-xs font-medium text-amber-900" role="alert">{mediaError}</p>}
      <div className="min-h-0 flex-1"><Stage /></div>
      <RoomAudioRenderer />
      <Controls onLeave={onLeave} />
    </LiveKitRoom>
  );
}
