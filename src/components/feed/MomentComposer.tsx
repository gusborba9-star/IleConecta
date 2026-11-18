import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Video } from "lucide-react";
import { Button, Modal, Textarea } from "@/components/base";
import { CAPTION_MAX, MAX_VIDEO_SECONDS, canPostVideo, isVideoType, remainingToday, validateMomentFile } from "@/lib/momentsCore";
import { fetchHouseId, fetchLinkChoices, fetchMyMoments, publishMoment, type LinkChoice } from "@/lib/moments";
import { toastSaveError } from "@/lib/planGuard";
import type { PlanCaps } from "@/lib/planMatrixCore";

interface Prepared { blob: Blob; type: string; previewUrl: string; poster?: Blob; duration?: number }

/** Lê a duração e tira um quadro de capa do vídeo. Falha (null) se o aparelho não conseguir ler. */
function readVideo(file: File): Promise<{ duration: number; poster: Blob } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    let done = false;
    const end = (r: { duration: number; poster: Blob } | null) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(r); };
    v.preload = "auto"; v.muted = true; v.playsInline = true;
    v.onerror = () => end(null);
    v.onloadedmetadata = () => { if (!Number.isFinite(v.duration) || v.duration <= 0) return end(null); v.currentTime = Math.min(0.2, v.duration / 2); };
    v.onseeked = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight, 1));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(v.videoWidth * scale)); c.height = Math.max(1, Math.round(v.videoHeight * scale));
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? end({ duration: v.duration, poster: b }) : end(null)), "image/webp", 0.8);
      } catch { end(null); }
    };
    window.setTimeout(() => end(null), 12000);
    v.src = url;
  });
}

/** Reduz a foto (lado maior até 1600 px), corrige a orientação e remove metadados (como a localização) ao reescrever em WebP. */
async function shrinkPhoto(file: File): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return (await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.82))) ?? (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85)));
  } catch { return null; }
}

export default function MomentComposer({ open, onClose, ownerId, caps, onPublished }: { open: boolean; onClose: () => void; ownerId: string; caps: PlanCaps | null; onPublished: () => void }) {
  const [file, setFile] = useState<Prepared | null>(null);
  const [caption, setCaption] = useState("");
  const [linkKey, setLinkKey] = useState("");
  const [choices, setChoices] = useState<LinkChoice[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = canPostVideo(caps);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const hid = await fetchHouseId(ownerId);
      if (!alive || !hid) return;
      setHouseId(hid);
      const [mine, links] = await Promise.all([fetchMyMoments(hid), fetchLinkChoices(hid)]);
      if (!alive) return;
      setLeft(remainingToday(caps, mine.length)); setChoices(links);
    })();
    return () => { alive = false; };
  }, [open, ownerId, caps]);

  useEffect(() => () => { if (file) URL.revokeObjectURL(file.previewUrl); }, [file]);
  const reset = () => { setFile(null); setCaption(""); setLinkKey(""); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const err = validateMomentFile(f, caps);
    if (err) return toast.error(err);
    setReading(true);
    try {
      if (isVideoType(f.type)) {
        const v = await readVideo(f);
        if (!v) return toast.error("Não foi possível ler esse vídeo. Tente outro.");
        if (v.duration > MAX_VIDEO_SECONDS + 0.5) return toast.error("O vídeo pode ter até 30 segundos.");
        setFile({ blob: f, type: f.type, previewUrl: URL.createObjectURL(f), poster: v.poster, duration: v.duration });
      } else {
        const b = await shrinkPhoto(f);
        if (!b) return toast.error("Não foi possível ler essa foto. Tente outra.");
        setFile({ blob: b, type: b.type, previewUrl: URL.createObjectURL(b) });
      }
    } finally { setReading(false); if (input.current) input.current.value = ""; }
  };

  const publish = async () => {
    if (!file || !houseId) return;
    const choice = choices.find((c) => `${c.kind}:${c.id}` === linkKey);
    setBusy(true);
    const r = await publishMoment({ ownerId, houseId, blob: file.blob, type: file.type, poster: file.poster, duration: file.duration, caption, link: choice ? { kind: choice.kind, id: choice.id } : null });
    setBusy(false);
    if (!r.ok) { const m = r.error ?? "Não foi possível publicar agora."; return m.startsWith("Momentos") || m.startsWith("Você chegou") ? toastSaveError(m) : toast.error(m); }
    toast.success("Momento publicado. Fica no ar por 24 horas.");
    reset(); onPublished(); onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Novo momento" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Fica no ar por 24 horas, no topo do feed de quem segue a sua casa.
          {left !== null && <> Hoje você ainda pode publicar <strong>{left}</strong> {left === 1 ? "momento" : "momentos"}.</>}
        </p>
        {!file ? (
          <div>
            <input ref={input} type="file" className="sr-only" id="moment-file" accept={video ? "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp"} onChange={(e) => void pick(e.target.files?.[0])} />
            <label htmlFor="moment-file" className="flex flex-col items-center justify-center gap-2 h-48 rounded-2xl border-2 border-dashed border-border bg-muted/30 cursor-pointer text-sm font-semibold hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
              {video ? <Video className="h-6 w-6 text-primary" aria-hidden /> : <ImagePlus className="h-6 w-6 text-primary" aria-hidden />}
              {reading ? "Lendo o arquivo…" : video ? "Escolher foto ou vídeo (até 30 s)" : "Escolher uma foto"}
            </label>
            {!video && <p className="text-xs text-muted-foreground mt-2">Momentos em vídeo (até 30 segundos) fazem parte do plano Premium.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl overflow-hidden bg-black h-64 grid place-items-center">
              {isVideoType(file.type)
                ? <video src={file.previewUrl} className="h-full w-full object-contain" controls muted playsInline aria-label="Prévia do vídeo" />
                : <img src={file.previewUrl} alt="Prévia do momento" className="h-full w-full object-contain" />}
            </div>
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Trocar arquivo</Button>
            <div>
              <label htmlFor="moment-caption" className="text-sm font-semibold">Legenda (opcional)</label>
              <Textarea id="moment-caption" value={caption} maxLength={CAPTION_MAX} rows={2} onChange={(e) => setCaption(e.target.value)} placeholder="Uma frase curta" />
              <div className="text-xs text-muted-foreground text-right">{caption.length}/{CAPTION_MAX}</div>
            </div>
            {choices.length > 0 && (
              <div>
                <label htmlFor="moment-link" className="text-sm font-semibold">Ligar a um serviço ou ritual (opcional)</label>
                <select id="moment-link" value={linkKey} onChange={(e) => setLinkKey(e.target.value)} className="mt-1 w-full h-11 rounded-[14px] border border-border bg-card px-3 text-sm">
                  <option value="">Sem ligação</option>
                  {choices.map((c) => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.kind === "event" ? "Ritual" : "Serviço"}: {c.title}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>Voltar</Button>
          <Button onClick={() => void publish()} disabled={!file || busy || !houseId || left === 0}>{busy ? "Publicando…" : "Publicar"}</Button>
        </div>
        {left === 0 && <p className="text-xs text-destructive">Você chegou ao limite de momentos de hoje. Amanhã libera de novo, ou veja os planos para publicar mais.</p>}
      </div>
    </Modal>
  );
}
