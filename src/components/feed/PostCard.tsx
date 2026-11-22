import PostEvent from "@/components/feed/PostEvent";
import { categoryLabel } from "@/lib/postCategoryCore.js";
import StyledPostBody from "@/components/feed/StyledPostBody";
import { useEffect, useState } from "react";
import type { Post } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { BadgeCheck, Heart, MessageCircle, Share2, MoreHorizontal, Send, Trash2, Pencil, MessageCircleOff, EyeOff, Eye } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn, timeAgo } from "@/lib/utils";
import RitualCard from "./RitualCard";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";
import { toast } from "sonner";
import { shownCommentCount, visibleComments as pickVisibleComments } from "@/lib/postCommentsCore";

export default function PostCard({ post }: { post: Post }) {
  const { users, currentUser, toggleLike, commentPost, deletePost, editPost, setCommentsOff, setCommentHidden, refreshRemote, loadComments, rituals, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const { config } = usePlatformConfig();
  const [text, setText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [menu, setMenu] = useState<"closed" | "open" | "checking" | "confirm">("closed");
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const author = users.find((u) => u.id === post.houseId);
  const houseAuthor = author?.type === "commercial" ? author : null;
  const isHouse = houseAuthor !== null;
  const liked = currentUser ? post.likes.includes(currentUser.id) : false;
  const ritual = post.ritualId ? rituals.find((r) => r.id === post.ritualId) : null;
  const canBoost = isRemoteAuth && !!currentUser && currentUser.type === "commercial" && post.houseId === currentUser.id && post.kind !== "story" && isFeatureOn(config, "boost", currentUser.id);
  const authorPath = isHouse ? `/casa/${author?.id}` : author?.id === currentUser?.id ? "/perfil" : undefined;

  const mine = !!currentUser && currentUser.type === "commercial" && currentUser.id === post.houseId && post.kind !== "story";
  const remove = async () => {
    setDeleting(true);
    const err = await deletePost(post.id);
    setDeleting(false);
    if (err === null) return void toast.success("Publicação excluída.");
    setMenu("closed");
    toast.error(err);
  };

  // Antes de mostrar o caminho para excluir um post impulsionado, pergunta de novo ao banco (o reembolso pode ter sido concluído enquanto a casa estava em outra tela).
  const askDelete = async () => {
    if (!post.deleteInfo) return void setMenu("confirm");
    setMenu("checking");
    await refreshRemote();
    setMenu("confirm");
  };
  const di = post.deleteInfo;
  const deadlineText = di?.deadline ? new Date(di.deadline).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const textLimit = post.card ? 400 : 2000;
  const saveEdit = async () => {
    if (editing === null || saving) return;
    const clean = editing.trim();
    if (!clean) return void toast.error("Escreva o texto da publicação.");
    if (clean.length > textLimit) return void toast.error(post.card ? "No card o texto pode ter até 400 caracteres." : "O texto pode ter até 2000 caracteres.");
    if (clean === post.content.trim()) return void setEditing(null);
    setSaving(true);
    const err = await editPost(post.id, clean);
    setSaving(false);
    if (err === null) {
      setEditing(null);
      return void toast.success("Publicação atualizada.");
    }
    toast.error(err);
  };
  const toggleCommentsOff = async () => {
    setMenu("closed");
    const off = !post.commentsOff;
    const err = await setCommentsOff(post.id, off);
    if (err === null) return void toast.success(off ? "Comentários desativados." : "Comentários ativados.");
    toast.error(err);
  };
  const toggleHidden = async (commentId: string, hidden: boolean) => {
    const err = await setCommentHidden(post.id, commentId, hidden);
    if (err === null) return void toast.success(hidden ? "Comentário ocultado." : "Comentário visível de novo.");
    toast.error(err);
  };
  // Comentário oculto: só a casa dona e quem escreveu o veem (o banco já filtra; isto cobre o modo demonstração).
  const who = { mine, userId: currentUser?.id };
  const visibleComments = pickVisibleComments(post, who);
  const commentTotal = shownCommentCount(post, who);
  // Comentários sob demanda (post real): o feed traz só a contagem; a lista é lida ao abrir (e de novo se a contagem mudou).
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "error">("idle");
  const needsLoad = post.commentsLoaded === false;
  useEffect(() => {
    if (!showComments || !needsLoad || commentsState !== "idle") return;
    setCommentsState("loading");
    void loadComments(post.id).then((ok) => setCommentsState(ok ? "idle" : "error"));
  }, [showComments, needsLoad, commentsState, post.id, loadComments]);
  const commentsLocked = !!post.commentsOff && !mine;

  // Compartilhar: o link abre o feed já nesta publicação (quem não tem conta entra primeiro). Celular usa o menu de compartilhar; no computador copia o link.
  const share = async () => {
    const url = `${window.location.origin}/comunidade?post=${post.id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${author?.name ?? "Publicação"} no Ilê Conecta`, url });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // a pessoa fechou o menu: não é erro
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <Card className="overflow-hidden">
      {post.category && post.category !== "geral" && (
        <div aria-hidden className={cn("h-[3px]", post.category === "evento" ? "bg-gold" : post.category === "aviso" ? "bg-primary" : "bg-forest/70")} />
      )}
      <div className="p-4 flex items-start gap-3">
        {authorPath ? (
          <Link to={authorPath}>
            <Avatar src={author?.avatar} name={author?.name} size={44} ring={isHouse ? "gold" : "none"} />
          </Link>
        ) : (
          <Avatar src={author?.avatar} name={author?.name} size={44} ring={isHouse ? "gold" : "none"} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {authorPath ? (
              <Link to={authorPath} className="text-[15px] font-semibold hover:underline">{author?.name}</Link>
            ) : (
              <span className="text-[15px] font-semibold">{author?.name}</span>
            )}
            {isHouse && houseAuthor?.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" role="img" aria-label="Casa verificada" />}
            {categoryLabel(post.category) && <Badge tone="gold">{categoryLabel(post.category)}</Badge>}
            {post.kind !== "geral" && (
              <Badge tone={post.kind === "ritual" ? "gold" : post.kind === "buzios" ? "forest" : "muted"}>
                {post.kind === "buzios" ? "Jogo" : post.kind === "trabalho" ? "Trabalho" : post.kind === "ritual" ? "Ritual" : ""}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {isHouse ? `${houseAuthor!.city} · ${houseAuthor!.category}` : "Cliente"} · {timeAgo(post.createdAt)}{post.editedAt && <span> · editado</span>}
          </div>
        </div>
        {canBoost && (
          <Link to={`/impulsionar?item=post:${post.id}`} className="shrink-0 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Impulsionar</Link>
        )}
        {mine && (
          <div className="relative shrink-0">
            <button type="button" aria-label="Mais opções da publicação" aria-expanded={menu !== "closed"} onClick={() => setMenu((m) => (m === "closed" ? "open" : "closed"))} className="h-11 w-11 -mr-2 -mt-2 rounded-full grid place-items-center text-muted-foreground hover:bg-muted">
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu === "open" && (
              <div role="menu" className="absolute right-0 top-10 z-10 w-52 rounded-xl border border-border bg-card p-1 shadow-card">
                {post.textLock?.state !== "travado" && (
                  <button type="button" role="menuitem" onClick={() => { setEditing(post.content); setMenu("closed"); }} className="w-full min-h-11 rounded-lg px-3 flex items-center gap-2 text-sm font-semibold hover:bg-muted">
                    <Pencil className="h-4 w-4" aria-hidden /> {post.textLock ? "Corrigir texto (1 vez)" : "Editar texto"}
                  </button>
                )}
                {post.textLock?.state === "travado" && <p className="px-3 py-2 text-xs text-muted-foreground">Texto travado durante o impulsionamento.</p>}
                <button type="button" role="menuitem" onClick={() => void toggleCommentsOff()} className="w-full min-h-11 rounded-lg px-3 flex items-center gap-2 text-sm font-semibold hover:bg-muted">
                  <MessageCircleOff className="h-4 w-4" aria-hidden /> {post.commentsOff ? "Ativar comentários" : "Desativar comentários"}
                </button>
                <button type="button" role="menuitem" onClick={() => void askDelete()} className="w-full min-h-11 rounded-lg px-3 flex items-center gap-2 text-sm font-semibold text-destructive hover:bg-muted">
                  <Trash2 className="h-4 w-4" aria-hidden /> Excluir publicação
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {mine && menu === "checking" && <p role="status" className="mx-4 mb-3 text-sm text-muted-foreground">Verificando o impulsionamento…</p>}
      {mine && menu === "confirm" && (
        <div role="alertdialog" aria-label="Confirmar exclusão" className="mx-4 mb-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          {!di && <p className="text-sm"><strong>Excluir esta publicação?</strong> As curtidas e os comentários dela também serão apagados. Isso não pode ser desfeito.</p>}
          {di?.state === "reembolsavel" && (
            <p className="text-sm"><strong>Esta publicação está impulsionada e não pode ser excluída agora.</strong> Para excluir antes do fim, vá até Pedidos e validações e escolha “Cancelar agora”{deadlineText ? ` (disponível até ${deadlineText})` : " (até 7 dias depois da compra)"}. Lá você vê o valor do reembolso dos dias que ainda não começaram; o dia em andamento não é devolvido.</p>
          )}
          {di?.state === "reembolso_pendente" && <p className="text-sm"><strong>O reembolso está sendo concluído.</strong> Volte em alguns minutos para excluir a publicação.</p>}
          {di?.state === "aguardar" && <p className="text-sm"><strong>Esta publicação está impulsionada</strong> e só poderá ser excluída quando o impulsionamento terminar.</p>}
          {di?.state === "liberado" && (
            <p className="text-sm"><strong>Excluir esta publicação?</strong> O reembolso foi concluído. Os dias de impulsionamento que já começaram foram pagos e não são devolvidos: eles param quando a publicação sai do ar. As curtidas e os comentários também serão apagados. Isso não pode ser desfeito. Se preferir, mantenha a publicação até esses dias acabarem.</p>
          )}
          <div className="flex gap-2 flex-wrap">
            {(!di || di.state === "liberado" || di.state === "reembolsavel") && (
              <Button variant="outline" size="sm" disabled={deleting} onClick={() => setMenu("closed")}>{di?.state === "liberado" ? "Manter até o fim" : "Cancelar"}</Button>
            )}
            {di?.state === "reembolsavel" && <Button size="sm" onClick={() => nav("/planos?aba=cobrancas#pedidos")}>Ir para Pedidos e validações</Button>}
            {(di?.state === "reembolso_pendente" || di?.state === "aguardar") && <Button variant="outline" size="sm" onClick={() => setMenu("closed")}>Entendi</Button>}
            {(!di || di.state === "liberado") && <Button variant="danger" size="sm" disabled={deleting} onClick={() => void remove()}>{deleting ? "Excluindo…" : di ? "Excluir agora" : "Excluir"}</Button>}
          </div>
        </div>
      )}

      {mine && editing !== null && (
        <div className="mx-4 mb-3 space-y-2">
          <textarea
            aria-label="Editar texto da publicação"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-input bg-card p-3 text-[15px] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs", editing.length > textLimit ? "text-destructive font-semibold" : "text-muted-foreground")}>{editing.length}/{textLimit}</span>
            {post.card && <span className="text-xs text-muted-foreground">A imagem e as letras do card não mudam.</span>}
            {post.textLock?.state === "correcao" && (
              <span className="basis-full text-xs text-muted-foreground">
                Publicação impulsionada: você pode corrigir o texto uma única vez{post.textLock.until ? `, até ${new Date(post.textLock.until).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}. Depois ele fica travado até o impulsionamento terminar.
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button>
              <Button size="sm" disabled={saving || !editing.trim() || editing.length > textLimit} onClick={() => void saveEdit()}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </div>
        </div>
      )}

      {post.card ? (
        <StyledPostBody text={post.content} card={post.card} />
      ) : (
        <div className="px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</div>
      )}

      {!post.card && post.image && (
        <div className="border-t border-border">
          <img src={post.image} alt="" loading="lazy" decoding="async" className="w-full max-h-[520px] object-cover" />
        </div>
      )}

      {post.eventId && <PostEvent eventId={post.eventId} city={isHouse ? houseAuthor?.city : undefined} />}

      {ritual && (
        <div className="p-4 pt-3 border-t border-border">
          <RitualCard ritual={ritual} compact />
        </div>
      )}

      <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{post.likeCount ?? post.likes.length} curtidas</span>
        <button onClick={() => setShowComments((v) => !v)}>{commentTotal === undefined ? "Comentários" : commentTotal === 1 ? "1 comentário" : `${commentTotal} comentários`}</button>
      </div>

      <div className="px-2 pb-1.5 border-t border-border/60 grid grid-cols-3">
        <ActionBtn active={liked} onClick={() => toggleLike(post.id)} icon={Heart} label="Curtir" activeClass="text-primary" />
        <ActionBtn onClick={() => setShowComments((v) => !v)} icon={MessageCircle} label={commentsLocked ? "Comentários" : "Comentar"} />
        <ActionBtn onClick={() => void share()} icon={Share2} label="Compartilhar" />
      </div>

      {showComments && (
        <div className="px-4 py-3 border-t border-border space-y-3 bg-muted/40">
          {needsLoad && commentsState !== "error" && visibleComments.length === 0 && <p className="text-xs text-muted-foreground" role="status">Carregando comentários…</p>}
          {needsLoad && commentsState === "error" && (
            <p className="text-xs text-muted-foreground" role="alert">
              Não foi possível carregar os comentários.{" "}
              <button type="button" className="font-semibold underline" onClick={() => setCommentsState("idle")}>Tentar de novo</button>
            </p>
          )}
          {visibleComments.map((c) => {
            const u = users.find((x) => x.id === c.userId);
            return (
              <div key={c.id} className={cn("flex gap-2", c.hidden && "opacity-60")}>
                <Avatar src={u?.avatar} name={u?.name ?? "Participante"} size={32} />
                <div className="bg-card rounded-2xl px-3 py-2 border border-border pillow min-w-0">
                  <div className="text-xs font-semibold">{u?.name ?? "Participante"}</div>
                  <div className="text-sm break-words">{c.text}</div>
                  {c.hidden && mine && <div className="text-xs text-muted-foreground mt-1">Oculto para o público</div>}
                  {mine && c.userId !== currentUser?.id && (
                    <button type="button" onClick={() => void toggleHidden(c.id, !c.hidden)} className="mt-1 min-h-8 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                      {c.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />} {c.hidden ? "Mostrar" : "Ocultar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {post.commentsOff && (
            <p className="text-xs text-muted-foreground">{mine ? "Você desativou os comentários: só a sua casa pode comentar aqui." : "A casa desativou os comentários desta publicação."}</p>
          )}
          {!commentsLocked && <div className="flex gap-2">
            <Avatar src={currentUser?.avatar} name={currentUser?.name} size={32} />
            <div className="flex-1 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) {
                    commentPost(post.id, text.trim());
                    setText("");
                  }
                }}
                placeholder="Escreva um comentário..."
                className="flex-1 h-10 px-4 rounded-full bg-card border border-input text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Enviar comentário"
                onClick={() => {
                  if (text.trim()) {
                    commentPost(post.id, text.trim());
                    setText("");
                  }
                }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>}
        </div>
      )}
    </Card>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  active,
  activeClass,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  activeClass?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-11 min-w-0 rounded-xl flex items-center justify-center gap-1.5 px-1 text-sm font-semibold whitespace-nowrap hover:bg-muted transition disabled:opacity-50",
        active ? activeClass : "text-muted-foreground"
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "fill-current" : "")} strokeWidth={1.75} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}
