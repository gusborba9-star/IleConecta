import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Eye, Flag, Heart, MessageCircle, MoreVertical, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar, Button } from "@/components/base";
import { COMMENT_MAX, REPORT_REASONS, expiresInPt, itemSeconds, jumpGroup, nextPosition, prevPosition, timeAgoPt, type MomentGroup, type MomentStats } from "@/lib/momentsCore";
import { deleteMomentComment, fetchMomentStats, recordMomentView, reportMoment, sendMomentComment, setMomentLike } from "@/lib/moments";

interface Props {
  groups: MomentGroup[];
  start: { gi: number; ii: number };
  /** Id do dono logado: some "Falar com a casa" e "Denunciar" no próprio momento e aparece "Apagar". */
  viewerId?: string | null;
  onSeen: (id: string) => void;
  onClose: () => void;
  onDelete?: (id: string) => Promise<boolean>;
}

/** Visualizador em tela cheia: barras de progresso, toque para avançar/voltar, segurar para pausar, deslizar para trocar de casa ou fechar. */
let pendingBack: number | null = null;

export default function MomentViewer({ groups, start, viewerId, onSeen, onClose, onDelete }: Props) {
  const nav = useNavigate();
  const [pos, setPos] = useState(start);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [posting, setPosting] = useState(false);
  const [panel, setPanel] = useState(false);
  const [stats, setStats] = useState<MomentStats | null | "loading">(null);
  const group = groups[pos.gi];
  const item = group?.items[pos.ii];
  const paused = holding || menu || reporting || typing || panel;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const onSeenRef = useRef(onSeen), onCloseRef = useRef(onClose);
  onSeenRef.current = onSeen; onCloseRef.current = onClose;
  const isOwn = Boolean(viewerId && group?.ownerId === viewerId);

  const go = useCallback((p: { gi: number; ii: number } | null) => {
    if (!p) return onCloseRef.current();
    setPos(p); setProgress(0); setFailed(false);
  }, []);
  const next = useCallback(() => go(nextPosition(groups, pos.gi, pos.ii)), [groups, pos, go]);
  const prev = useCallback(() => go(prevPosition(groups, pos.gi, pos.ii)), [groups, pos, go]);

  // marca como visto ao aparecer
  useEffect(() => {
    if (!item) return;
    onSeenRef.current(item.id);
    if (viewerId && group?.ownerId !== viewerId) recordMomentView(item.id);
    setText(""); setPanel(false); setStats(null);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // foto: o tempo corre aqui; vídeo: quem manda é o próprio vídeo
  useEffect(() => {
    if (!item || item.kind === "video" || paused || failed) return;
    const total = itemSeconds(item) * 1000;
    let raf = 0, last = performance.now(), acc = progress * total;
    const tick = (now: number) => {
      acc += now - last; last = now;
      if (acc >= total) { setProgress(1); next(); return; }
      setProgress(acc / total);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, paused, failed]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else void v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => undefined); });
  }, [paused, item?.id]);

  // música da foto: toca com o momento; pausa quando o momento pausa; se o aparelho não deixar tocar, o botão de som fica como "desligado"
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (paused || muted || failed) a.pause();
    else void a.play().catch((e: unknown) => { if ((e as { name?: string })?.name === "NotAllowedError") setMuted(true); }); // só o bloqueio do aparelho silencia; interromper ao trocar de momento não é erro
    return () => a.pause(); // fechar o visualizador ou trocar de momento nunca deixa música tocando
  }, [paused, muted, failed, item?.id]);

  // carrega antes a próxima foto
  useEffect(() => {
    const n = nextPosition(groups, pos.gi, pos.ii);
    const it = n ? groups[n.gi]?.items[n.ii] : null;
    if (it && it.kind === "image") { const i = new Image(); i.src = it.url; }
  }, [groups, pos]);

  // foco, rolagem da página e botão "voltar" do celular
  useEffect(() => {
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    // Se o React remontou logo após desmontar (modo de desenvolvimento), a entrada do histórico ainda existe: não empilha outra.
    if (pendingBack !== null) { window.clearTimeout(pendingBack); pendingBack = null; }
    else window.history.pushState({ moment: true }, "");
    let popped = false;
    const onPop = () => { popped = true; onCloseRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = prevOverflow;
      if (!popped && window.history.state?.moment) {
        pendingBack = window.setTimeout(() => { pendingBack = null; if (window.history.state?.moment) window.history.back(); }, 0);
      }
      prevFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reporting) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) { if (e.key === "Escape") { e.preventDefault(); t.blur(); } return; } // digitando: setas e Esc não navegam
      if (e.key === "Escape") { e.preventDefault(); if (panel) setPanel(false); else if (menu) setMenu(false); else onCloseRef.current(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, menu, reporting, panel]);

  const label = useMemo(() => (group ? `Momentos de ${group.name}` : "Momentos"), [group]);
  if (!group || !item) return null;

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nogesture]")) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
    holdTimer.current = window.setTimeout(() => setHolding(true), 220);
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current; if (!g) return;
    if (Math.abs(e.clientX - g.x) > 12 || Math.abs(e.clientY - g.y) > 12) g.moved = true;
  };
  const up = (e: React.PointerEvent) => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    const g = gesture.current; gesture.current = null; setHolding(false);
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.moved) {
      if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { const j = jumpGroup(groups, pos.gi, dx < 0 ? 1 : -1); if (j) go(j); }
      return;
    }
    if (Date.now() - g.t > 260) return; // foi um "segurar", não um toque
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) prev(); else next();
  };

  const sendReport = async () => {
    if (!reason) return toast.error("Escolha o motivo.");
    setSending(true);
    const r = await reportMoment(item.id, reason);
    setSending(false);
    if (!r.ok) return toast.error(r.error ?? "Não foi possível enviar a denúncia agora.");
    toast.success("Denúncia enviada. Obrigado por avisar.");
    setReporting(false); setReason("");
  };
  const remove = async () => {
    if (!onDelete) return;
    setMenu(false);
    const ok = await onDelete(item.id);
    if (!ok) return toast.error("Não foi possível apagar agora.");
    toast.success("Momento apagado.");
    const rest = group.items.length - 1;
    if (rest <= 0) onClose(); else go({ gi: pos.gi, ii: Math.min(pos.ii, rest - 1) });
  };
  const goLink = () => {
    if (!item.link) return;
    onClose();
    window.setTimeout(() => nav(item.link!.kind === "event" ? `/rituais/${item.link!.id}` : `/casa/${group.ownerId}`), 0);
  };
  const talk = () => { onClose(); window.setTimeout(() => nav(`/mensagens/${group.ownerId}`), 0); };

  const liked = likedMap[item.id] ?? item.liked;
  const toggleLike = async () => {
    const on = !liked;
    setLikedMap((m) => ({ ...m, [item.id]: on }));
    const r = await setMomentLike(item.id, on);
    if (!r.ok) { setLikedMap((m) => ({ ...m, [item.id]: !on })); toast.error(r.error ?? "Não foi possível curtir agora."); }
  };
  const sendComment = async () => {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    const r = await sendMomentComment(item.id, body);
    setPosting(false);
    if (r.ok) { setText(""); setTyping(false); (document.activeElement as HTMLElement | null)?.blur(); toast.success("Comentário enviado. Só a casa vê."); }
    else toast.error(r.error ?? "Não foi possível comentar agora.");
  };
  const openPanel = async () => {
    setPanel(true); setStats("loading");
    setStats(await fetchMomentStats(item.id));
  };
  const removeComment = async (id: string) => {
    if (!(await deleteMomentComment(id))) return toast.error("Não foi possível apagar agora.");
    setStats((st) => (st && st !== "loading" ? { ...st, commentsCount: Math.max(0, st.commentsCount - 1), comments: st.comments.filter((c) => c.id !== id) } : st));
  };
  const reply = (userId: string) => { onClose(); window.setTimeout(() => nav(`/mensagens/${userId}`), 0); };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" data-testid="moment-viewer">
      <div
        className="relative h-full w-full sm:h-[min(92vh,820px)] sm:w-auto sm:aspect-[9/16] sm:max-w-[460px] sm:rounded-2xl overflow-hidden bg-black select-none touch-none"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; setHolding(false); }}
      >
        {item.kind === "video" ? (
          <>
          {item.poster && <img src={item.poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-60" draggable={false} />}
          <video key={item.id} ref={videoRef} src={item.url} poster={item.poster ?? undefined} className="absolute inset-0 h-full w-full object-contain" autoPlay playsInline muted={muted} preload="auto"
            onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration > 0) setProgress(Math.min(1, v.currentTime / Math.min(v.duration, 30))); }}
            onEnded={next} onError={() => setFailed(true)} aria-label={item.caption ?? `Vídeo de ${group.name}`} />
          </>
        ) : (
          <>
            {/* fundo desfocado com a própria foto: qualquer formato preenche a tela, como no Facebook */}
            <img src={item.url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-60" draggable={false} />
            <img key={item.id} src={item.url} alt={item.caption ?? `Momento de ${group.name}`} className="absolute inset-0 h-full w-full object-contain" draggable={false} onError={() => setFailed(true)} />
          </>
        )}
        {item.music && <audio key={item.id} ref={audioRef} src={item.music.url} loop preload="auto" aria-hidden />}
        {failed && (
          <div className="absolute inset-0 grid place-items-center text-center text-white/90 p-6">
            <div><p className="font-semibold">Não foi possível carregar este momento.</p><Button data-nogesture variant="secondary" size="sm" className="mt-3" onClick={next}>Seguir</Button></div>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

        <div className="absolute top-2 inset-x-2 flex gap-1" aria-hidden>
          {group.items.map((it, k) => (
            <div key={it.id} className="h-[3px] flex-1 rounded-full bg-white/35 overflow-hidden">
              <div className="h-full bg-white" style={{ width: `${k < pos.ii ? 100 : k === pos.ii ? Math.round(progress * 100) : 0}%` }} />
            </div>
          ))}
        </div>

        <div className="absolute top-5 inset-x-3 flex items-center gap-2 text-white" data-nogesture>
          <Avatar src={group.avatar} name={group.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-base truncate drop-shadow-md">{group.name}</div>
            <div className="text-[11px] text-white/80">{timeAgoPt(item.createdAt)} · some em {expiresInPt(item.expiresAt)}</div>
            {item.music && <div className="text-[11px] text-white/90 truncate" data-testid="moment-music">♪ {item.music.title}{item.music.author ? ` — ${item.music.author}` : ""}</div>}
          </div>
          {(item.kind === "video" || item.music) && (
            <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Ligar o som" : "Desligar o som"} className="h-9 w-9 grid place-items-center rounded-full bg-black/35 hover:bg-black/55">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Mais opções" aria-haspopup="menu" aria-expanded={menu} className="h-9 w-9 grid place-items-center rounded-full bg-black/35 hover:bg-black/55"><MoreVertical className="h-4 w-4" /></button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-1 w-44 rounded-xl bg-card text-foreground shadow-card border border-border overflow-hidden z-10">
                {isOwn ? (
                  onDelete && <button role="menuitem" type="button" onClick={() => void remove()} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" /> Apagar momento</button>
                ) : (
                  <button role="menuitem" type="button" onClick={() => { setMenu(false); setReporting(true); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted"><Flag className="h-4 w-4" /> Denunciar</button>
                )}
              </div>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar" className="h-9 w-9 grid place-items-center rounded-full bg-black/35 hover:bg-black/55"><X className="h-5 w-5" /></button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 space-y-3 text-white" data-nogesture>
          {item.caption && <p className="text-base leading-snug font-medium drop-shadow-md whitespace-pre-line break-words">{item.caption}</p>}
          <div className="flex flex-wrap gap-2">
            {item.link && (
              <Button size="sm" variant="secondary" onClick={goLink}>{item.link.kind === "event" ? "Ver ritual" : "Ver serviço"}: {item.link.title.slice(0, 28)} <ChevronRight className="h-4 w-4" /></Button>
            )}
          </div>
          {isOwn ? (
            <button type="button" onClick={() => void openPanel()} aria-label={`Ver atividade: ${item.views ?? 0} visualizações, ${item.likes ?? 0} curtidas, ${item.comments ?? 0} comentários`} className="flex items-center gap-4 rounded-full bg-black/40 px-4 py-2 text-sm font-semibold hover:bg-black/55">
              <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" aria-hidden />{item.views ?? 0}</span>
              <span className="flex items-center gap-1.5"><Heart className="h-4 w-4" aria-hidden />{item.likes ?? 0}</span>
              <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" aria-hidden />{item.comments ?? 0}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="moment-comment">Comentar neste momento</label>
              <input id="moment-comment" value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendComment(); } }} enterKeyHint="send" autoComplete="off" placeholder="Comentar… (só a casa vê)"
                className="min-w-0 flex-1 h-11 rounded-full border border-white/50 bg-black/35 px-4 text-sm text-white placeholder:text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-white" />
              {text.trim() ? (
                <button type="button" onClick={() => void sendComment()} disabled={posting} aria-label="Enviar comentário" className="h-11 w-11 shrink-0 grid place-items-center rounded-full bg-white text-black disabled:opacity-60"><Send className="h-5 w-5" /></button>
              ) : (
                <>
                  <button type="button" onClick={() => void toggleLike()} aria-pressed={liked} aria-label={liked ? "Descurtir" : "Curtir"} className="h-11 w-11 shrink-0 grid place-items-center rounded-full bg-black/35 hover:bg-black/55"><Heart className={`h-6 w-6 ${liked ? "fill-red-500 text-red-500" : ""}`} /></button>
                  <button type="button" onClick={talk} aria-label="Falar com a casa" title="Falar com a casa" className="h-11 w-11 shrink-0 grid place-items-center rounded-full bg-black/35 hover:bg-black/55"><MessageCircle className="h-6 w-6" /></button>
                </>
              )}
            </div>
          )}
        </div>

        {panel && isOwn && (
          <div className="absolute inset-x-0 bottom-0 z-20 max-h-[75%] overflow-y-auto rounded-t-2xl bg-card text-foreground p-4 space-y-4" data-nogesture role="dialog" aria-modal="true" aria-label="Atividade do momento">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Atividade</h2>
              <button type="button" onClick={() => setPanel(false)} aria-label="Fechar atividade" className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            {stats === "loading" && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {stats === null && <p className="text-sm text-muted-foreground">Não foi possível carregar agora.</p>}
            {stats && stats !== "loading" && (
              <>
                <p className="text-sm text-muted-foreground">{stats.views} {stats.views === 1 ? "pessoa viu" : "pessoas viram"} · {stats.likes} {stats.likes === 1 ? "curtida" : "curtidas"} · {stats.commentsCount} {stats.commentsCount === 1 ? "comentário" : "comentários"}</p>
                <section aria-label="Quem curtiu">
                  <h3 className="text-sm font-semibold mb-2">Curtidas</h3>
                  {stats.likers.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém curtiu ainda.</p> : (
                    <ul className="space-y-2">{stats.likers.map((l) => (
                      <li key={l.userId} className="flex items-center gap-2 text-sm"><Avatar src={l.avatar} name={l.name} size={28} /><span className="flex-1 truncate">{l.name}</span><button type="button" onClick={() => reply(l.userId)} className="text-primary text-xs font-semibold">Conversar</button></li>
                    ))}</ul>
                  )}
                </section>
                <section aria-label="Comentários">
                  <h3 className="text-sm font-semibold mb-2">Comentários</h3>
                  {stats.comments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p> : (
                    <ul className="space-y-3">{stats.comments.map((c) => (
                      <li key={c.id} className="flex gap-2 text-sm"><Avatar src={c.avatar} name={c.name} size={28} />
                        <div className="min-w-0 flex-1"><div className="font-semibold truncate">{c.name} <span className="font-normal text-xs text-muted-foreground">{timeAgoPt(c.at)}</span></div>
                          <p className="whitespace-pre-line break-words">{c.body}</p>
                          <div className="mt-1 flex gap-3 text-xs font-semibold"><button type="button" onClick={() => reply(c.userId)} className="text-primary">Responder</button><button type="button" onClick={() => void removeComment(c.id)} className="text-destructive">Apagar</button></div>
                        </div></li>
                    ))}</ul>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {reporting && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-4" data-nogesture>
            <div role="dialog" aria-modal="true" aria-label="Denunciar momento" className="w-full max-w-xs rounded-2xl bg-card text-foreground p-4 space-y-3">
              <h2 className="font-display font-bold text-lg">Denunciar momento</h2>
              <fieldset className="space-y-1.5">
                <legend className="text-sm text-muted-foreground mb-1">O que há de errado?</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="moment-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} /> {r.label}</label>
                ))}
              </fieldset>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setReporting(false); setReason(""); }}>Voltar</Button>
                <Button size="sm" disabled={sending} onClick={() => void sendReport()}>Enviar denúncia</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
