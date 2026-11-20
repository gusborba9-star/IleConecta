import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Maximize2, Minimize2, Move, Smile, Trash2, Type, X } from "lucide-react";
import {
  EDIT_COLORS, EDIT_EMOJIS, EDIT_FONTS, LAYERS_MAX, OUT_H, OUT_W, SIZE_MAX, SIZE_MIN, TEXT_MAX, ZOOM_MAX, ZOOM_MIN,
  clampFrame, cleanText, coverScale, defaultFrame, hitLayer, isDefaultFrame, makeLayer, pinchValue, sanitizeLayers,
  type EditFrame, type EditLayer, type LayerBox,
} from "@/lib/momentEditCore";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { drawScene, ensureFonts, renderFinal, sourceSize, type Src } from "@/lib/momentEditRender";

export interface EditState { frame: EditFrame; layers: EditLayer[] }
type Tab = "enquadrar" | "texto" | "emoji";
type Pt = { x: number; y: number };
interface Gesture { target: "frame" | "layer"; layerId: string | null; start: Pt; startFrame: EditFrame; startLayer: EditLayer | null; pinch: { dist: number; mid: Pt } | null }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const blank = (l: EditLayer) => !l.text.trim();

/** Editor em tela cheia (foto): enquadrar com os dedos, texto com fontes e cores, emojis. O resultado é uma imagem final 9:16. */
export default function MomentEditor({ blob, initial, onCancel, onDone }: { blob: Blob; initial?: EditState | null; onCancel: () => void; onDone: (out: Blob, state: EditState) => void }) {
  const [src, setSrc] = useState<Src | null>(null);
  const [frame, setFrame] = useState<EditFrame>(initial?.frame ?? defaultFrame());
  const [layers, setLayers] = useState<EditLayer[]>(initial?.layers ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("enquadrar");
  const [busy, setBusy] = useState(false);
  const [fontTick, setFontTick] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 270, h: 480 });
  const wrap = useRef<HTMLDivElement>(null);
  const dialogRoot = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRoot);
  const canvas = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<LayerBox[]>([]);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const live = useRef({ frame, layers, selectedId });
  live.current = { frame, layers, selectedId };
  const size = useRef({ iw: 1, ih: 1 });

  // carrega a foto
  useEffect(() => {
    let alive = true; let bmp: ImageBitmap | null = null;
    void createImageBitmap(blob).then((b) => { bmp = b; if (!alive) return b.close(); size.current = { iw: b.width, ih: b.height }; setSrc(b); }, () => { if (alive) { toast.error("Não foi possível abrir essa foto no editor."); onCancel(); } });
    return () => { alive = false; bmp?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // palco 9:16 que cabe na área livre
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(); const w = Math.max(120, Math.min(r.width - 8, (r.height - 8) * (OUT_W / OUT_H))); setBox({ w: Math.floor(w), h: Math.floor(w * (OUT_H / OUT_W)) }); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // trava a rolagem da página e fecha com Esc
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) { e.stopPropagation(); onCancel(); } };
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [onCancel]);

  // fontes: desenha de novo quando a fonte escolhida terminar de carregar
  useEffect(() => { let a = true; void ensureFonts(layers).then(() => { if (a) setFontTick((n) => n + 1); }); return () => { a = false; }; }, [layers]);

  const visible = useMemo(() => layers.filter((l) => !blank(l)), [layers]);
  useEffect(() => {
    const c = canvas.current; if (!c || !src) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(box.w * dpr); c.height = Math.round(box.h * dpr);
    const ctx = c.getContext("2d"); if (!ctx) return;
    boxes.current = drawScene(ctx, c.width, c.height, src, frame, visible, { selectedId });
  }, [src, frame, visible, selectedId, box, fontTick]);

  const norm = (e: { clientX: number; clientY: number }): Pt => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const clampF = useCallback((f: EditFrame) => clampFrame(size.current.iw, size.current.ih, OUT_W, OUT_H, f), []);
  const patchLayer = useCallback((id: string, p: Partial<EditLayer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))), []);

  const begin = (pt: Pt) => {
    const c = canvas.current!; const hit = hitLayer(boxes.current, pt.x * c.width, pt.y * c.height);
    const { frame: f, layers: ls } = live.current;
    gesture.current = { target: hit ? "layer" : "frame", layerId: hit, start: pt, startFrame: f, startLayer: hit ? ls.find((l) => l.id === hit) ?? null : null, pinch: null };
    if (hit) { setSelectedId(hit); const l = ls.find((x) => x.id === hit); setTab(l?.kind === "emoji" ? "emoji" : "texto"); } else setSelectedId(null);
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, norm(e));
    if (pointers.current.size === 1) begin(norm(e));
    else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()]; const g = gesture.current;
      g.startFrame = live.current.frame; g.startLayer = g.layerId ? live.current.layers.find((l) => l.id === g.layerId) ?? null : null;
      g.pinch = { dist: dist(a, b) * box.w, mid: mid(a, b) }; g.start = mid(a, b);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, norm(e));
    const g = gesture.current; if (!g) return;
    const pts = [...pointers.current.values()];
    const cur = pts.length >= 2 ? mid(pts[0], pts[1]) : pts[0];
    const dx = cur.x - g.start.x, dy = cur.y - g.start.y;
    const ratio = g.pinch && pts.length >= 2 ? (dist(pts[0], pts[1]) * box.w) : 0;
    if (g.target === "frame") {
      const scale = g.pinch && ratio ? pinchValue(g.startFrame.scale, g.pinch.dist, ratio, ZOOM_MIN, ZOOM_MAX) : g.startFrame.scale;
      setFrame(clampF({ scale, cx: g.startFrame.cx + dx, cy: g.startFrame.cy + dy }));
    } else if (g.startLayer) {
      const sl = g.startLayer;
      patchLayer(sl.id, { x: Math.min(0.98, Math.max(0.02, sl.x + dx)), y: Math.min(0.98, Math.max(0.02, sl.y + dy)), size: g.pinch && ratio ? pinchValue(sl.size, g.pinch.dist, ratio, SIZE_MIN, SIZE_MAX) : sl.size });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1) { const pt = [...pointers.current.values()][0]; const g = gesture.current; if (g) { g.start = pt; g.pinch = null; g.startFrame = live.current.frame; g.startLayer = g.layerId ? live.current.layers.find((l) => l.id === g.layerId) ?? null : null; } }
  };

  // roda do mouse: zoom (precisa ser "não passivo" para impedir a página de rolar)
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const w = (e: WheelEvent) => { e.preventDefault(); setFrame((f) => clampF({ ...f, scale: f.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })); };
    c.addEventListener("wheel", w, { passive: false });
    return () => c.removeEventListener("wheel", w);
  }, [clampF, src]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.015; const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const sel = live.current.selectedId ? live.current.layers.find((l) => l.id === live.current.selectedId) : null;
    if (d[e.key]) { e.preventDefault(); const [dx, dy] = d[e.key]; if (sel) patchLayer(sel.id, { x: Math.min(0.98, Math.max(0.02, sel.x + dx)), y: Math.min(0.98, Math.max(0.02, sel.y + dy)) }); else setFrame((f) => clampF({ ...f, cx: f.cx + dx, cy: f.cy + dy })); }
    else if (e.key === "+" || e.key === "=" || e.key === "-") { e.preventDefault(); const up = e.key !== "-"; if (sel) patchLayer(sel.id, { size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, sel.size * (up ? 1.08 : 1 / 1.08))) }); else setFrame((f) => clampF({ ...f, scale: f.scale * (up ? 1.08 : 1 / 1.08) })); }
    else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); remove(sel.id); }
  };

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const add = (kind: "text" | "emoji", text: string) => {
    if (layers.length >= LAYERS_MAX) return toast.error(`Dá para colocar até ${LAYERS_MAX} itens na imagem.`);
    const l = makeLayer(kind, text, { y: kind === "text" ? 0.5 : 0.35 + ((layers.length * 0.07) % 0.3), x: kind === "emoji" ? 0.3 + ((layers.length * 0.13) % 0.4) : 0.5 });
    if (!l) return; setLayers((ls) => [...ls, l]); setSelectedId(l.id); setTab(kind === "emoji" ? "emoji" : "texto");
    if (kind === "text") window.setTimeout(() => { const i = document.getElementById("momento-texto") as HTMLInputElement | null; i?.focus(); i?.select(); }, 30);
  };
  const remove = (id: string) => { setLayers((ls) => ls.filter((l) => l.id !== id)); setSelectedId(null); };

  const finish = async () => {
    if (!src || busy) return;
    setBusy(true);
    try {
      const clean = sanitizeLayers(layers);
      const state: EditState = { frame, layers: clean };
      if (isDefaultFrame(frame) && clean.length === 0) return onDone(blob, state); // nada mudou: segue com a foto original
      const out = await renderFinal(src, frame, clean);
      if (!out) return void toast.error("Não foi possível montar a imagem. Tente de novo.");
      onDone(out, state);
    } catch { toast.error("Não foi possível montar a imagem. Tente de novo."); } finally { setBusy(false); }
  };

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button type="button" aria-pressed={tab === t} onClick={() => { setTab(t); if (t === "enquadrar") setSelectedId(null); }}
      className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold ${tab === t ? "bg-white text-black" : "bg-white/10 text-white"}`}>{icon}{label}</button>
  );
  const chip = "h-10 min-w-10 px-3 rounded-xl text-sm font-semibold bg-white/10 text-white aria-pressed:bg-white aria-pressed:text-black";

  return (
    <div ref={dialogRoot} role="dialog" aria-modal="true" aria-label="Editar momento" className="fixed inset-0 z-[80] bg-neutral-950 text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-between px-3 h-14 shrink-0">
        <button type="button" onClick={onCancel} disabled={busy} className="h-11 px-3 inline-flex items-center gap-1 rounded-xl text-sm font-semibold bg-white/10"><X className="h-4 w-4" aria-hidden />Cancelar</button>
        <h2 className="text-sm font-semibold">Editar momento</h2>
        <button type="button" onClick={() => void finish()} disabled={busy || !src} className="h-11 px-5 rounded-xl text-sm font-bold bg-white text-black disabled:opacity-50">{busy ? "Montando…" : "Concluir"}</button>
      </div>

      <div ref={wrap} className="flex-1 min-h-0 flex items-center justify-center">
        <canvas ref={canvas} tabIndex={0} aria-label="Área de edição. Arraste para mover, use dois dedos para aproximar. Com o teclado: setas movem, mais e menos mudam o tamanho."
          style={{ width: box.w, height: box.h, touchAction: "none" }} className="rounded-2xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-white select-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey} />
      </div>

      <div className="shrink-0 px-3 pt-2 pb-3 space-y-2 max-h-[42vh] overflow-y-auto">
        <div className="flex gap-2">
          {tabBtn("enquadrar", "Enquadrar", <Move className="h-4 w-4" aria-hidden />)}
          {tabBtn("texto", "Texto", <Type className="h-4 w-4" aria-hidden />)}
          {tabBtn("emoji", "Emoji", <Smile className="h-4 w-4" aria-hidden />)}
        </div>

        {tab === "enquadrar" && (
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm"><span className="w-12 shrink-0">Zoom</span>
              <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={frame.scale} aria-label="Zoom da foto" className="flex-1 h-11" onChange={(e) => setFrame((f) => clampF({ ...f, scale: Number(e.target.value) }))} /></label>
            <div className="flex gap-2">
              <button type="button" className={`${chip} flex-1 inline-flex items-center justify-center gap-1.5`} onClick={() => setFrame(defaultFrame())}><Minimize2 className="h-4 w-4" aria-hidden />Foto inteira</button>
              <button type="button" className={`${chip} flex-1 inline-flex items-center justify-center gap-1.5`} onClick={() => setFrame(clampF({ scale: coverScale(size.current.iw, size.current.ih, OUT_W, OUT_H), cx: 0.5, cy: 0.5 }))}><Maximize2 className="h-4 w-4" aria-hidden />Preencher a tela</button>
            </div>
            <p className="text-xs text-white/60">Arraste a foto para mover e use dois dedos para aproximar ou afastar.</p>
          </div>
        )}

        {tab === "texto" && (
          <div className="space-y-2">
            <button type="button" className={`${chip} w-full`} onClick={() => add("text", "Seu texto")}>+ Adicionar texto</button>
            {selected?.kind === "text" && (
              <div className="space-y-2">
                <label className="block text-xs text-white/70" htmlFor="momento-texto">Texto</label>
                <input id="momento-texto" value={selected.text} maxLength={TEXT_MAX} onChange={(e) => patchLayer(selected.id, { text: cleanText(e.target.value) })}
                  className="w-full h-11 rounded-xl bg-white/10 px-3 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-white" />
                <div className="flex flex-wrap gap-2" role="group" aria-label="Fonte">
                  {EDIT_FONTS.map((f) => <button key={f.key} type="button" aria-pressed={selected.font === f.key} className={chip} style={{ fontFamily: f.family, fontWeight: f.weight }} onClick={() => patchLayer(selected.id, { font: f.key })}>{f.label}</button>)}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Cor da letra">
                  {EDIT_COLORS.map((c) => <button key={c.hex} type="button" aria-label={c.label} aria-pressed={selected.color === c.hex} onClick={() => patchLayer(selected.id, { color: c.hex })}
                    className={`h-10 w-10 rounded-full border-2 ${selected.color === c.hex ? "border-white ring-2 ring-white/60" : "border-white/30"}`} style={{ background: c.hex }} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "emoji" && (
          <div className="space-y-2">
            <div className="grid grid-cols-8 gap-1" role="group" aria-label="Emojis">
              {EDIT_EMOJIS.map((e) => <button key={e} type="button" aria-label={`Adicionar ${e}`} onClick={() => add("emoji", e)} className="h-10 rounded-lg bg-white/10 text-xl">{e}</button>)}
            </div>
          </div>
        )}

        {selected && (tab === "texto" || tab === "emoji") && (
          <div className="flex items-center gap-3">
            <label className="flex flex-1 items-center gap-3 text-sm"><span className="w-16 shrink-0">Tamanho</span>
              <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={0.005} value={selected.size} aria-label="Tamanho" className="flex-1 h-11" onChange={(e) => patchLayer(selected.id, { size: Number(e.target.value) })} /></label>
            <button type="button" aria-label="Remover item" onClick={() => remove(selected.id)} className="h-11 w-11 rounded-xl bg-red-500/20 text-red-200 inline-flex items-center justify-center"><Trash2 className="h-5 w-5" aria-hidden /></button>
          </div>
        )}

        {layers.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Itens na imagem">
            {layers.map((l, i) => <button key={l.id} type="button" aria-pressed={selectedId === l.id} className={`${chip} max-w-[45%] truncate`} onClick={() => { setSelectedId(l.id); setTab(l.kind === "emoji" ? "emoji" : "texto"); }}>
              {l.kind === "emoji" ? `Emoji ${l.text}` : `Texto ${i + 1}: ${l.text.slice(0, 14) || "vazio"}`}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
