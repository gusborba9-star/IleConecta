import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Lock, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button } from "@/components/base";
import { signedUrl } from "@/lib/chatFiles";
import VideoRecorder from "@/components/rituals/VideoRecorder";
import { addRecord, addVideoRecord, canRecordVideo, deleteRecord, fetchRecords, RECORD_KIND_LABEL, type EventRecord, type RecordKind } from "@/lib/eventRecords";

interface Props {
  eventId: string;
  isOwn: boolean;
  /** O ritual já começou (a casa só publica depois de iniciar). */
  started: boolean;
  /** Ritual concluído há mais de 7 dias: a casa não publica mais. */
  closedForNew: boolean;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const until = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

function RecordPhoto({ rec, isOwn, onDelete }: { rec: EventRecord; isOwn: boolean; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void signedUrl("ritual-records", rec.path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [rec.path]);

  return (
    <figure className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="relative bg-muted/40 aspect-[4/3] grid place-items-center">
        {failed ? <span className="text-xs text-muted-foreground">Arquivo indisponível</span> : !url ? <div className="h-full w-full animate-pulse bg-muted/50" /> : rec.media === "video" ? (
          <video src={url} controls playsInline preload="metadata" controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} className="h-full w-full object-contain bg-black" />
        ) : rec.secret ? (
          <img src={url} alt={rec.caption ?? "Registro reservado"} draggable={false} onContextMenu={(e) => e.preventDefault()} className="h-full w-full object-cover select-none pointer-events-none" />
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="h-full w-full block">
            <img src={url} alt={rec.caption ?? "Registro do ritual"} loading="lazy" className="h-full w-full object-cover" />
          </a>
        )}
        {rec.secret && <span className="absolute top-2 left-2"><Badge tone="muted"><Lock className="h-3 w-3 inline mr-1" />Reservado</Badge></span>}
        {isOwn && (
          <button type="button" aria-label="Apagar registro" onClick={onDelete} className="absolute top-2 right-2 p-1.5 rounded-full bg-background/90 text-destructive hover:bg-background">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <figcaption className="p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="gold">{RECORD_KIND_LABEL[rec.kind]}{rec.media === "video" ? " · vídeo" : ""}</Badge>
          <span className="text-muted-foreground">{fmt(rec.createdAt)}</span>
        </div>
        {rec.caption && <p className="mt-1 whitespace-pre-line">{rec.caption}</p>}
        <p className="mt-1 text-[10px] text-muted-foreground">Disponível até {until(rec.expiresAt)}</p>
      </figcaption>
    </figure>
  );
}

/** Registros do ritual: a casa publica fotos (e vídeos, se liberado); participantes confirmados veem. */
export default function RitualRecords({ eventId, isOwn, started, closedForNew }: Props) {
  const [items, setItems] = useState<EventRecord[] | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<RecordKind>("inicio");
  const [caption, setCaption] = useState("");
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setItems(await fetchRecords(eventId)), [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let alive = true;
    if (isOwn) void canRecordVideo(eventId).then((ok) => alive && setVideoOk(ok));
    return () => {
      alive = false;
    };
  }, [eventId, isOwn]);

  const count = items?.length ?? 0;
  if (!isOwn && count === 0) return null;
  if (isOwn && !started && count === 0) return null;

  const pick = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    const res = await addRecord(eventId, kind, caption, secret, file);
    setBusy(false);
    if (!res.ok) return void toast.error(res.message);
    toast.success(`Registro publicado. ${res.notified} ${res.notified === 1 ? "participante avisado" : "participantes avisados"}.`);
    setCaption("");
    setSecret(false);
    setAdding(false);
    setRecording(false);
    setOpen(true);
    await load();
  };

  const sendVideo = async (blob: Blob) => {
    if (busy) return;
    setBusy(true);
    const res = await addVideoRecord(eventId, kind, caption, secret, blob);
    setBusy(false);
    if (!res.ok) return void toast.error(res.message);
    toast.success(`Vídeo publicado. ${res.notified} ${res.notified === 1 ? "participante avisado" : "participantes avisados"}.`);
    setCaption("");
    setSecret(false);
    setAdding(false);
    setRecording(false);
    setOpen(true);
    await load();
  };

  const remove = async (rec: EventRecord) => {
    if (!window.confirm("Apagar este registro para todos?")) return;
    if (await deleteRecord(rec.id, rec.path)) {
      toast.success("Registro apagado.");
      await load();
    } else toast.error("Não foi possível apagar.");
  };

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-sm font-semibold flex items-center gap-2" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Camera className="h-4 w-4" /> Registros do ritual ({count}) <span className="text-xs text-muted-foreground">{open ? "ocultar" : "ver"}</span>
        </button>
        {isOwn && started && !closedForNew && !adding && <Button size="sm" variant="outline" onClick={() => { setAdding(true); setOpen(true); }}>Adicionar registro</Button>}
      </div>

      {isOwn && adding && (
        <div className="mt-3 rounded-xl border border-border p-3 space-y-3 bg-muted/30">
          <div className="flex gap-2" role="radiogroup" aria-label="Momento do registro">
            {(Object.keys(RECORD_KIND_LABEL) as RecordKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={"px-3 py-1.5 rounded-full text-sm border " + (kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border")}>
                {RECORD_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input aria-label="Legenda" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (opcional)"
            className="w-full h-10 px-3 rounded-lg bg-background border border-input text-sm" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
            <span>Reservado: sem link para abrir ou baixar. <span className="text-muted-foreground">Quem tem vaga ainda consegue tirar print, então nenhuma foto é 100% sigilosa. Mostre só o que puder ser visto. A administração só vê se houver um pedido de reembolso do ritual.</span></span>
          </label>
          <p className="text-xs text-muted-foreground">Os participantes são avisados. A foto fica disponível por 30 dias{videoOk ? " e o vídeo por 7 dias" : ""}.</p>
          {recording ? (
            <VideoRecorder onDone={(b) => void sendVideo(b)} onCancel={() => setRecording(false)} />
          ) : (
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
            <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : "Escolher foto e publicar"}</Button>
            {videoOk && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRecording(true)}><Video className="h-4 w-4" /> Gravar vídeo (30 s)</Button>}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : items.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-full">Nenhum registro ainda.</p>
          ) : items.map((rec) => <RecordPhoto key={rec.id} rec={rec} isOwn={isOwn} onDelete={() => void remove(rec)} />)}
        </div>
      )}
    </div>
  );
}
