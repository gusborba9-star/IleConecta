import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button, Card, Input } from "@/components/base";
import { musicUrl } from "@/lib/moments";
import { MUSIC_MAX_BYTES } from "@/lib/momentsCore";
import { addTrack, deleteTrack, fetchMusicAdmin, setMusicEnabled, setTrackActive, updateTrack, type MusicAdminState, type MusicFields, type MusicRow } from "@/lib/musicAdmin";

const EMPTY: MusicFields = { title: "", author: "", source: "", license: "", licenseDate: "" };
const mb = (b: number) => `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB`;

/** Biblioteca de músicas dos Momentos (só o proprietário). Faixas livres de direitos, cadastradas por você. */
export default function MusicLibraryCard() {
  const [st, setSt] = useState<MusicAdminState | null | "loading">("loading");
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState<MusicFields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<MusicFields>(EMPTY);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setSt(await fetchMusicAdmin()), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { audio.current?.pause(); }, []);

  const preview = (t: MusicRow) => {
    if (playing === t.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    const url = musicUrl(t.path); if (!url) return;
    const a = new Audio(url); audio.current = a; a.onended = () => setPlaying(null); a.onerror = () => { setPlaying(null); toast.error("Não foi possível tocar esta faixa."); };
    void a.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null));
  };

  const add = async () => {
    if (!file) return;
    setBusy(true);
    const r = await addTrack(file, f);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Não foi possível cadastrar.");
    toast.success("Música cadastrada e já disponível para as casas.");
    setFile(null); setF(EMPTY); if (input.current) input.current.value = ""; await load();
  };
  const toggleAll = async (on: boolean) => { if (await setMusicEnabled(on)) { toast.success(on ? "Música ligada para todas as casas." : "Música desligada para todas as casas."); await load(); } else toast.error("Não foi possível alterar agora."); };
  const toggle = async (t: MusicRow) => { if (await setTrackActive(t.id, !t.active)) await load(); else toast.error("Não foi possível alterar agora."); };
  const save = async (id: string) => { const r = await updateTrack(id, draft); if (!r.ok) return void toast.error(r.error ?? "Não foi possível salvar."); setEditing(null); toast.success("Faixa atualizada."); await load(); };
  const del = async (t: MusicRow) => { if (confirmDel !== t.id) return void setConfirmDel(t.id); setConfirmDel(null); if (playing === t.id) { audio.current?.pause(); setPlaying(null); } if (await deleteTrack(t.id)) { toast.success("Faixa apagada."); await load(); } else toast.error("Não foi possível apagar agora."); };

  if (st === "loading") return <Card className="p-5"><h2 className="font-display font-bold text-lg">Biblioteca de músicas</h2><p className="text-sm text-muted-foreground mt-2">Carregando…</p></Card>;
  if (!st) return <Card className="p-5"><h2 className="font-display font-bold text-lg">Biblioteca de músicas</h2><p className="text-sm text-muted-foreground mt-2">Não foi possível carregar agora.</p></Card>;
  const pct = st.max_total_bytes ? Math.min(100, Math.round((st.total_bytes / st.max_total_bytes) * 100)) : 0;
  const field = (k: keyof MusicFields, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <label className="block text-sm font-semibold">{label}<Input className="mt-1 font-normal" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} {...props} /></label>
  );

  return (
    <div data-testid="music-library">
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg">Biblioteca de músicas</h2>
        <p className="text-sm text-muted-foreground">Faixas livres de direitos que as casas podem colocar nos momentos com foto. Só você cadastra. As faixas novas já aparecem para as casas, desde que a música esteja ligada para todos.</p>
      </div>

      <div className="rounded-lg border border-border/70 p-3 flex items-start gap-3">
        <div className="flex-1 text-sm">
          <div className="font-semibold">Música nos momentos: {st.enabled ? <span className="text-forest">ligada</span> : <span className="text-destructive">desligada</span>}</div>
          <p className="text-muted-foreground">Mantenha desligada até o advogado confirmar os direitos de uso das faixas. Desligada, nenhuma casa vê a opção e os momentos tocam sem música.</p>
        </div>
        <Button size="sm" variant={st.enabled ? "outline" : "primary"} onClick={() => void toggleAll(!st.enabled)}>{st.enabled ? "Desligar" : "Ligar"}</Button>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted-foreground"><span>{st.tracks.length} de {st.max_count} faixas</span><span>{mb(st.total_bytes)} de {mb(st.max_total_bytes)} usados</span></div>
        <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-label="Espaço usado pelas músicas" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${pct >= 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
        <h3 className="font-semibold text-sm">Cadastrar música</h3>
        <label className="block text-sm font-semibold">Arquivo (MP3, M4A ou OGG, até {mb(MUSIC_MAX_BYTES)})
          <input ref={input} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.m4a,.ogg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm font-normal" />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          {field("title", "Título", { maxLength: 80 })}
          {field("author", "Autor(a)", { maxLength: 80 })}
          {field("source", "Link de onde baixou (https://…)", { maxLength: 300, inputMode: "url" })}
          {field("licenseDate", "Data da conferência da licença", { type: "date" })}
        </div>
        {field("license", "Observação da licença (ex.: Pixabay Content License)", { maxLength: 300 })}
        <Button onClick={() => void add()} disabled={!file || busy || !f.title.trim() || !f.author.trim()}>{busy ? "Enviando…" : "Cadastrar música"}</Button>
      </div>

      {st.tracks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada ainda.</p>}
      <ul className="space-y-2">
        {st.tracks.map((t) => (
          <li key={t.id} className="rounded-lg border border-border/70 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => preview(t)} aria-label={playing === t.id ? `Parar ${t.title}` : `Ouvir ${t.title}`} className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center">{playing === t.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{t.title} <span className="font-normal text-muted-foreground">· {t.author}</span></div>
                <div className="text-xs text-muted-foreground">{mb(t.size_bytes)} · usada em {t.uses} {t.uses === 1 ? "momento" : "momentos"}{t.license_date ? ` · licença conferida em ${new Date(`${t.license_date}T12:00:00`).toLocaleDateString("pt-BR")}` : " · licença sem data"}</div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold shrink-0"><input type="checkbox" role="switch" checked={t.active} onChange={() => void toggle(t)} aria-label={`Faixa ${t.title} ligada`} className="h-5 w-5" />{t.active ? "Ligada" : "Desligada"}</label>
            </div>
            {(t.source_url || t.license_note) && <p className="text-xs text-muted-foreground break-words">{t.license_note}{t.source_url && <> · <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="underline">fonte</a></>}</p>}
            {editing === t.id ? (
              <div className="grid sm:grid-cols-2 gap-2">
                <Input aria-label="Título" value={draft.title} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                <Input aria-label="Autor" value={draft.author} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))} />
                <Input aria-label="Link da fonte" value={draft.source} maxLength={300} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} />
                <Input aria-label="Data da licença" type="date" value={draft.licenseDate} onChange={(e) => setDraft((d) => ({ ...d, licenseDate: e.target.value }))} />
                <Input className="sm:col-span-2" aria-label="Observação da licença" value={draft.license} maxLength={300} onChange={(e) => setDraft((d) => ({ ...d, license: e.target.value }))} />
                <div className="sm:col-span-2 flex gap-2"><Button size="sm" onClick={() => void save(t.id)} disabled={!draft.title.trim() || !draft.author.trim()}>Salvar</Button><Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(t.id); setDraft({ title: t.title, author: t.author, source: t.source_url ?? "", license: t.license_note ?? "", licenseDate: t.license_date ?? "" }); }}>Editar</Button>
                <Button size="sm" variant="outline" onClick={() => void del(t)}><Trash2 className="h-4 w-4" aria-hidden /> {confirmDel === t.id ? "Confirmar: apagar" : "Apagar"}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
    </div>
  );
}
