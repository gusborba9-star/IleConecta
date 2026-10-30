import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Square } from "lucide-react";
import { Button } from "@/components/base";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/eventRecords";

interface Props {
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}

const MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const pickMime = () => (typeof MediaRecorder === "undefined" ? undefined : MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)));

type Phase = "starting" | "ready" | "recording" | "review" | "error";

/** Grava vídeo curto dentro do app (câmera traseira, até 30 s, ~1,2 Mbps → cerca de 4,5 MB). */
export default function VideoRecorder({ onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [review, setReview] = useState<{ blob: Blob; url: string } | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openCamera = useCallback(async () => {
    setError(null);
    setPhase("starting");
    if (!navigator.mediaDevices?.getUserMedia || !pickMime()) {
      setError("Este aparelho não permite gravar vídeo pelo app.");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
        audio: true,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        liveRef.current.muted = true;
        await liveRef.current.play().catch(() => undefined);
      }
      setPhase("ready");
    } catch {
      setError("Não foi possível abrir a câmera. Permita o acesso à câmera e ao microfone nas configurações do navegador.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void openCamera();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      stopStream();
    };
  }, [openCamera, stopStream]);

  useEffect(() => () => { if (review) URL.revokeObjectURL(review.url); }, [review]);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }, []);

  const start = () => {
    const stream = streamRef.current;
    const mime = pickMime();
    if (!stream || !mime) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 });
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
      stopStream();
      if (blob.size > VIDEO_MAX_BYTES) {
        setError("O vídeo ficou grande demais. Grave um trecho mais curto.");
        setPhase("error");
        return;
      }
      setReview({ blob, url: URL.createObjectURL(blob) });
      setPhase("review");
    };
    rec.start(1000);
    setSeconds(0);
    setPhase("recording");
    const t0 = Date.now();
    timerRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSeconds(s);
      if (s >= VIDEO_MAX_SECONDS) stop();
    }, 250);
  };

  const again = () => {
    setReview(null);
    void openCamera();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3" role="group" aria-label="Gravar vídeo">
      {phase !== "review" && (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
          <video ref={liveRef} playsInline muted className="h-full w-full object-cover" />
          {phase === "recording" && (
            <span className="absolute top-2 left-2 rounded-full bg-black/70 text-white text-xs px-2 py-1 flex items-center gap-1" aria-live="off">
              <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500" /> {seconds}s / {VIDEO_MAX_SECONDS}s
            </span>
          )}
          {phase === "starting" && <span className="absolute inset-0 grid place-items-center text-white text-sm">Abrindo a câmera…</span>}
        </div>
      )}
      {phase === "review" && review && (
        <video src={review.url} controls playsInline className="w-full rounded-lg bg-black aspect-video" />
      )}
      {error && <p role="alert" className="text-sm text-[hsl(var(--danger))]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {phase === "ready" && <Button size="sm" onClick={start}><Circle className="h-4 w-4" /> Gravar (até {VIDEO_MAX_SECONDS} s)</Button>}
        {phase === "recording" && <Button size="sm" onClick={stop}><Square className="h-4 w-4" /> Parar</Button>}
        {phase === "review" && review && <Button size="sm" onClick={() => onDone(review.blob)}>Usar este vídeo</Button>}
        {(phase === "review" || phase === "error") && <Button size="sm" variant="outline" onClick={again}>Gravar de novo</Button>}
        {phase !== "recording" && <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}
