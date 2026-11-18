import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Music, Pause, Pencil, Play, Video } from "lucide-react";
import { Button, Modal, Textarea } from "@/components/base";
import { CAPTION_MAX, MAX_VIDEO_SECONDS, canPostVideo, isVideoType, remainingToday, validateMomentFile } from "@/lib/momentsCore";
import { fetchHouseId, fetchLinkChoices, fetchMusicCatalog, fetchMyMoments, fetchPublishedToday, publishMoment, type LinkChoice } from "@/lib/moments";
import { toastSaveError } from "@/lib/planGuard";
import type { PlanCaps } from "@/lib/planMatrixCore";
import { MUSIC_OCCASIONS, MUSIC_STYLES, filterMusic, type MomentMusic } from "@/lib/momentsCore";
import type { EditState } from "@/components/feed/MomentEditor";
// o editor (fontes, desenho) só é baixado quando a casa escolhe uma foto
const MomentEditor = lazy(() => import("@/components/feed/MomentEditor"));

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
    const scale = Math.min(1, 1440 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); } // PNG com fundo transparente não pode ficar "invisível" no cartão
    ctx?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return (await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.8))) ?? (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85)));
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
  const camera = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<Blob | null>(null); // foto reduzida, antes das edições
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [catalog, setCatalog] = useState<MomentMusic[]>([]);
  const [musicId, setMusicId] = useState("");
  const [listening, setListening] = useState(false);
  const [mf, setMf] = useState({ style: "", occasion: "", voice: "" as "" | "com" | "sem", q: "" });
  const audio = useRef<HTMLAudioElement | null>(null);
  const video = canPostVideo(caps);
  const shown = (() => { const l = filterMusic(catalog, mf); const sel = catalog.find((c) => c.id === musicId); return sel && !l.some((c) => c.id === sel.id) ? [sel, ...l] : l; })();
  const styles = Object.keys(MUSIC_STYLES).filter((k) => catalog.some((c) => c.style === k));
  const occasions = Object.keys(MUSIC_OCCASIONS).filter((k) => catalog.some((c) => c.occasions.includes(k)));

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const hid = await fetchHouseId(ownerId);
      if (!alive || !hid) return;
      setHouseId(hid);
      const [mine, links, published] = await Promise.all([fetchMyMoments(hid), fetchLinkChoices(hid), fetchPublishedToday(hid)]);
      if (!alive) return;
      setLeft(remainingToday(caps, published ?? mine.length)); setChoices(links);
    })();
    return () => { alive = false; };
  }, [open, ownerId, caps]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchMusicCatalog().then((c) => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, [open]);
  const stopAudio = () => { audio.current?.pause(); audio.current = null; setListening(false); };
  useEffect(() => { if (!open) stopAudio(); }, [open]);
  useEffect(() => () => { audio.current?.pause(); }, []);
  const listen = () => {
    if (listening) return stopAudio();
    const m = catalog.find((c) => c.id === musicId); if (!m) return;
    stopAudio();
    const a = new Audio(m.url); audio.current = a; a.onended = () => setListening(false); a.onerror = () => { setListening(false); toast.error("Não foi possível tocar esta música agora."); };
    void a.play().then(() => setListening(true)).catch(() => setListening(false));
  };
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.previewUrl); }, [file]);
  const reset = () => { stopAudio(); setMusicId(""); setMf({ style: "", occasion: "", voice: "", q: "" }); setFile(null); setOriginal(null); setEditing(false); setEditState(null); setCaption(""); setLinkKey(""); };
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
        setOriginal(null); setEditState(null);
        setFile({ blob: f, type: f.type, previewUrl: URL.createObjectURL(f), poster: v.poster, duration: v.duration });
      } else {
        const b = await shrinkPhoto(f);
        if (!b) return toast.error("Não foi possível ler essa foto. Tente outra.");
        setFile(null); setEditState(null); setOriginal(b); setEditing(true); // a foto passa pelo editor antes da prévia
      }
    } finally { setReading(false); if (input.current) input.current.value = ""; if (camera.current) camera.current.value = ""; }
  };

  const publish = async () => {
    if (!file || !houseId) return;
    const choice = choices.find((c) => `${c.kind}:${c.id}` === linkKey);
    setBusy(true);
    const r = await publishMoment({ ownerId, houseId, blob: file.blob, type: file.type, poster: file.poster, duration: file.duration, caption, link: choice ? { kind: choice.kind, id: choice.id } : null, musicId: !isVideoType(file.type) && catalog.some((c) => c.id === musicId) ? musicId : null });
    setBusy(false);
    if (!r.ok) { const m = r.error ?? "Não foi possível publicar agora."; return m.startsWith("Momentos") || m.startsWith("Você chegou") ? toastSaveError(m) : toast.error(m); }
    toast.success("Momento publicado. Fica no ar por 24 horas.");
    reset(); onPublished(); onClose();
  };

  return (
    <>
    {open && editing && original && (
      <Suspense fallback={<div role="status" className="fixed inset-0 z-[80] bg-neutral-950 text-white flex items-center justify-center text-sm">Abrindo o editor…</div>}>
      <MomentEditor blob={original} initial={editState}
        onCancel={() => { setEditing(false); if (!file) setOriginal(null); }}
        onDone={(out, st) => { setEditState(st); setFile({ blob: out, type: out.type, previewUrl: URL.createObjectURL(out) }); setEditing(false); }} />
      </Suspense>
    )}
    <Modal open={open && !editing} onClose={close} title="Novo momento" maxWidth="max-w-md">
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
            <input ref={camera} type="file" className="sr-only" id="moment-camera" accept="image/*" capture="environment" onChange={(e) => void pick(e.target.files?.[0])} />
            <label htmlFor="moment-camera" className="mt-2 flex items-center justify-center gap-2 h-11 rounded-2xl border border-border text-sm font-semibold cursor-pointer hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
              <Camera className="h-4 w-4 text-primary" aria-hidden />Tirar uma foto agora
            </label>
            {!video && <p className="text-xs text-muted-foreground mt-2">Momentos em vídeo (até 30 segundos) fazem parte do plano Premium.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative mx-auto h-80 aspect-[9/16] rounded-2xl overflow-hidden bg-black" aria-label="Como vai aparecer">
              {!isVideoType(file.type) && <img src={file.previewUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-60" />}
              {isVideoType(file.type)
                ? <video src={file.previewUrl} className="absolute inset-0 h-full w-full object-contain" controls muted playsInline aria-label="Prévia do vídeo" />
                : <img src={file.previewUrl} alt="Prévia do momento" className="absolute inset-0 h-full w-full object-contain" />}
              {!isVideoType(file.type) && <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />}
              {!isVideoType(file.type) && caption.trim() && <p className="absolute inset-x-2 bottom-2 text-white text-xs font-medium leading-snug drop-shadow-md break-words">{caption.trim()}</p>}
            </div>
            <p className="text-center text-xs text-muted-foreground">Assim as pessoas vão ver. Toque em "Editar foto" para enquadrar, escrever sobre a imagem e usar emojis.</p>
            <div className="flex flex-wrap gap-2">
              {original && !isVideoType(file.type) && <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}><Pencil className="h-4 w-4" aria-hidden /> Editar foto</Button>}
              <Button variant="outline" size="sm" onClick={reset} disabled={busy}>Trocar arquivo</Button>
            </div>
            <div>
              <label htmlFor="moment-caption" className="text-sm font-semibold">Legenda (opcional)</label>
              <Textarea id="moment-caption" value={caption} maxLength={CAPTION_MAX} rows={2} onChange={(e) => setCaption(e.target.value)} placeholder="Uma frase curta" />
              <div className="text-xs text-muted-foreground text-right">{caption.length}/{CAPTION_MAX}</div>
            </div>
            {catalog.length > 0 && !isVideoType(file.type) && (
              <div>
                <label htmlFor="moment-music" className="text-sm font-semibold">Música (opcional)</label>
                {catalog.length > 6 && (
                  <div className="mt-1 grid grid-cols-2 gap-2" data-testid="music-filters">
                    <select aria-label="Estilo da música" value={mf.style} onChange={(e) => setMf((x) => ({ ...x, style: e.target.value }))} className="h-10 rounded-[14px] border border-border bg-card px-2 text-sm">
                      <option value="">Todos os estilos</option>{styles.map((k) => <option key={k} value={k}>{MUSIC_STYLES[k]}</option>)}
                    </select>
                    <select aria-label="Ocasião da música" value={mf.occasion} onChange={(e) => setMf((x) => ({ ...x, occasion: e.target.value }))} className="h-10 rounded-[14px] border border-border bg-card px-2 text-sm">
                      <option value="">Todas as ocasiões</option>{occasions.map((k) => <option key={k} value={k}>{MUSIC_OCCASIONS[k]}</option>)}
                    </select>
                    <select aria-label="Voz" value={mf.voice} onChange={(e) => setMf((x) => ({ ...x, voice: e.target.value as "" | "com" | "sem" }))} className="h-10 rounded-[14px] border border-border bg-card px-2 text-sm">
                      <option value="">Com ou sem voz</option><option value="com">Com voz</option><option value="sem">Só instrumental</option>
                    </select>
                    <input type="search" aria-label="Buscar música" placeholder="Buscar título ou autor" value={mf.q} maxLength={60} onChange={(e) => setMf((x) => ({ ...x, q: e.target.value }))} className="h-10 rounded-[14px] border border-border bg-card px-3 text-sm min-w-0" />
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <select id="moment-music" value={musicId} onChange={(e) => { stopAudio(); setMusicId(e.target.value); }} className="flex-1 min-w-0 h-11 rounded-[14px] border border-border bg-card px-3 text-sm">
                    <option value="">Sem música</option>
                    {shown.map((c) => <option key={c.id} value={c.id}>{c.title}{c.author ? ` — ${c.author}` : ""}{c.vocal ? " (com voz)" : ""}</option>)}
                  </select>
                  <button type="button" onClick={listen} disabled={!musicId} aria-label={listening ? "Parar a música" : "Ouvir a música"} className="h-11 w-11 shrink-0 rounded-[14px] border border-border grid place-items-center disabled:opacity-40">{listening ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}</button>
                </div>
                {catalog.length > 6 && shown.filter((c) => c.id !== musicId).length === 0 && <p className="text-xs text-muted-foreground mt-1">Nenhuma música com esses filtros.</p>}
                {musicId && <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><Music className="h-3 w-3" aria-hidden /> Toca enquanto a foto aparece. Quem assiste pode silenciar.</p>}
              </div>
            )}
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
    </>
  );
}
