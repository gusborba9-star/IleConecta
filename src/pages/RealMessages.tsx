import { useConfirm } from "@/components/base/Confirm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, CalendarClock, Check, CheckCheck, Paperclip, Send, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card } from "@/components/base";
import ChatAttachment from "@/components/chat/ChatAttachment";
import ChatCheckoutButton from "@/components/chat/ChatCheckoutButton";
import ProposalCard from "@/components/chat/ProposalCard";
import ProposeScheduleModal from "@/components/chat/ProposeScheduleModal";
import ChatSafetyMenu from "@/components/chat/ChatSafetyMenu";
import { useApp } from "@/contexts/AppContext";
import { askAssistant, fetchAssistantAvatar } from "@/lib/assistant";
import HandoffBar from "@/components/chat/HandoffBar";
import { fetchHandoff } from "@/lib/handoff";
import { shouldCallAssistant, type Handoff } from "@/lib/handoffCore";
import { fetchAssistantName } from "@/lib/catalog";
import AssistantAvatar from "@/components/assistant/AssistantAvatar";
import { fetchQuickReplies, type QuickReply } from "@/lib/campaigns";
import ChatPremiumStrip from "@/components/premium/ChatPremiumStrip";
import { useOwnerPlan } from "@/lib/housePlan";
import { isPlaceholderText, prepareFile, sendAttachment, uploadFile } from "@/lib/chatFiles";
import {
  deleteMessage, fetchIBlocked, fetchMessages, fetchPeer, markConversationRead, listConversations, openConversation, sendDirect, subscribeMessages,
  type ChatMessage, type ConversationRow, type Peer,
} from "@/lib/messaging";
import { cn, timeAgo } from "@/lib/utils";
import { clockTime, dayLabel, decorateMessages } from "@/lib/chatTimeCore.js";

/** Mensagens reais. Se a casa estiver offline, a assistente dela atende primeiro. */
export default function RealMessages() {
  const confirm = useConfirm();
  const { id: otherId } = useParams();
  const { currentUser } = useApp();
  const nav = useNavigate();
  const [query, setQuery] = useSearchParams();
  const me = currentUser?.id;
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [assistantName, setAssistantName] = useState<string | null>(null);
  const [assistantAvatar, setAssistantAvatar] = useState<string | null>(null);
  const [iBlocked, setIBlocked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(async () => setConvos(await listConversations()), []);

  // Abre a conversa escolhida (cria se for nova) e carrega o interlocutor.
  useEffect(() => {
    let alive = true;
    setMsgs([]);
    setNotice(null);
    setHandoff(null);
    if (!otherId || !me) {
      setConvId(null);
      setPeer(null);
      return;
    }
    void (async () => {
      const [cid, p] = await Promise.all([openConversation(otherId), fetchPeer(otherId)]);
      if (!alive) return;
      setConvId(cid);
      setPeer(p);
      if (cid) {
        void fetchHandoff(cid).then((h) => alive && setHandoff(h));
        const list = await fetchMessages(cid);
        if (!alive) return;
        setMsgs(list);
        if (me && list.some((m) => m.senderId !== me && !m.read)) void markConversationRead(cid);
      }
    })();
    return () => {
      alive = false;
    };
  }, [otherId, me]);

  useEffect(() => {
    setIBlocked(false);
    if (!otherId || !me) return;
    let alive = true;
    void fetchIBlocked(otherId).then((b) => alive && setIBlocked(b));
    return () => {
      alive = false;
    };
  }, [otherId, me]);

  const peerIsHouse = peer?.isHouse ?? false;
  // Casa com assistente ativa: a faixa de atendimento fica sempre visível para ela.
  const [myAssistant, setMyAssistant] = useState(false);
  useEffect(() => {
    if (!me || currentUser?.type !== "commercial") { setMyAssistant(false); return; }
    let alive = true;
    void fetchAssistantName(me).then((n) => alive && setMyAssistant(Boolean(n)));
    return () => { alive = false; };
  }, [me, currentUser?.type]);
  useEffect(() => {
    if (!otherId || !peerIsHouse) {
      setAssistantName(null);
      setAssistantAvatar(null);
      return;
    }
    let alive = true;
    void fetchAssistantName(otherId).then((n) => alive && setAssistantName(n));
    void fetchAssistantAvatar(otherId).then((u) => alive && setAssistantAvatar(u));
    return () => {
      alive = false;
    };
  }, [otherId, peerIsHouse]);

  const refreshThread = useCallback(async () => {
    if (convId) {
      const list = await fetchMessages(convId);
      setMsgs(list);
      if (me && document.visibilityState === "visible" && list.some((m) => m.senderId !== me && !m.read)) void markConversationRead(convId);
    }
    if (otherId) setPeer(await fetchPeer(otherId));
    if (convId) setHandoff(await fetchHandoff(convId));
    await refreshList();
  }, [convId, otherId, me, refreshList]);

  const refreshRef = useRef(refreshThread);
  refreshRef.current = refreshThread;

  useEffect(() => {
    void refreshList();
    const stop = subscribeMessages(() => void refreshRef.current());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshRef.current();
    }, 10000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [refreshList]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length]);

  // "Pedir horário à casa": a conversa abre com a mensagem pronta citando o serviço (a pessoa ajusta e envia).
  const askTitle = query.get("t");
  useEffect(() => {
    if (!askTitle || !convId) return;
    setText((cur) => cur || `Olá! Quero agendar "${askTitle.slice(0, 80)}". Quais horários a casa tem disponíveis?`);
    setQuery({}, { replace: true });
  }, [askTitle, convId, setQuery]);

  // Celular: com a conversa aberta a página não rola (só a lista de mensagens), então cabeçalho, faixa de atendimento e campo de envio ficam parados ao enviar ou abrir o teclado.
  useEffect(() => {
    if (!otherId || typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 767px)").matches) return;
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => { el.style.overflow = prev; };
  }, [otherId]);

  // No celular, ao abrir uma conversa o cabeçalho (com o menu ⋮) volta para a tela.
  useEffect(() => {
    if (otherId) rootRef.current?.scrollIntoView({ block: "start" });
  }, [otherId, peer?.id]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || !convId || !otherId || !me || busy) return;
    setBusy(true);
    setNotice(null);
    setText("");
    const [fresh, freshHandoff] = await Promise.all([fetchPeer(otherId), fetchHandoff(convId)]);
    if (fresh) setPeer(fresh);
    setHandoff(freshHandoff);
    const houseOffline = Boolean(fresh?.isHouse && !fresh.online);
    let delivered = false;
    // Casa offline com assistente disponível e ninguém da casa atendendo: a assistente responde (a função grava a pergunta e a resposta).
    // Com a casa ou a equipe atendendo, a mensagem vai direto para elas (o servidor também recusa a assistente nesse caso).
    if (shouldCallAssistant({ houseOffline, hasAssistant: Boolean(assistantName), handoff: freshHandoff })) {
      const res = await askAssistant(otherId, msg, convId);
      delivered = res.ok;
      if (res.ok && res.handledByHuman) setNotice(res.message ?? "A casa está atendendo esta conversa.");
      else if (!res.ok) setNotice(res.message ? `${res.message} A casa verá a sua mensagem quando voltar.` : null);
    }
    if (!delivered) {
      const res = await sendDirect(convId, me, msg);
      if (res === "blocked") {
        // Mensagem neutra: não revela quem bloqueou quem.
        setNotice("Não é possível enviar mensagens nesta conversa.");
      } else if (res === "error") {
        toast.error("Não foi possível enviar esta mensagem. Tente novamente.");
        setText(msg);
      } else if (houseOffline && !notice) setNotice("A casa está offline e verá a sua mensagem quando voltar.");
    }
    await refreshRef.current();
    setBusy(false);
  };

  const [quick, setQuick] = useState<QuickReply[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const iAmHouse = currentUser?.type === "commercial";
  useEffect(() => {
    if (iAmHouse) void fetchQuickReplies().then(setQuick);
  }, [iAmHouse]);

  const houseOwnerId = peer?.isHouse ? otherId : me;
  const { caps: ownerCaps } = useOwnerPlan(houseOwnerId);
  const mediaOk = ownerCaps?.chat_media === true;

  const attach = async (file: File | undefined) => {
    if (!file || !convId || !me || busy) return;
    setBusy(true);
    setNotice(null);
    const prep = await prepareFile(file, mediaOk);
    if ("message" in prep) {
      toast.error(prep.message);
      setBusy(false);
      return;
    }
    const up = await uploadFile("chat-files", convId, prep.file);
    if (!up) {
      toast.error("Não foi possível enviar o arquivo. Tente novamente.");
      setBusy(false);
      return;
    }
    const res = await sendAttachment(convId, me, up, text);
    if (res === "ok") setText("");
    else if (res === "blocked") setNotice("Não é possível enviar mensagens nesta conversa.");
    else toast.error("Não foi possível enviar o arquivo. Tente novamente.");
    await refreshRef.current();
    setBusy(false);
  };

  const removeMsg = async (id: string) => {
    const ok = await deleteMessage(id);
    if (!ok) toast.error("Não foi possível apagar. Só dá para apagar mensagens suas dos últimos 2 dias.");
    await refreshRef.current();
  };

  /** Lixeira: pergunta e apaga na hora (funciona igual para texto, foto e PDF). */
  const askDelete = (id: string) => {
    void confirm({ title: "Apagar esta mensagem?", message: "Ela some para todos na conversa.", confirmLabel: "Apagar", danger: true }).then((ok) => { if (ok) void removeMsg(id); });
  };

  const offlineHouse = Boolean(peer?.isHouse && !peer.online);

  return (
    <div ref={rootRef} className="scroll-mt-20 max-md:-mx-3">
    {/* No celular a conversa ocupa a largura toda (sem moldura), como nos aplicativos de mensagem. */}
    <Card className="overflow-hidden sticky top-[4.5rem] h-[calc(100dvh-5.5rem)] grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] max-md:rounded-none max-md:border-x-0 max-md:shadow-none">
      <aside aria-label="Conversas" className={cn("border-r border-border overflow-y-auto", otherId && "hidden md:block")}>
        <div className="p-4 border-b border-border sticky top-0 bg-card z-10">
          <h1 className="font-display font-bold text-lg">Mensagens</h1>
        </div>
        {convos.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa ainda. Abra a página de uma casa e toque em Chat.</div>}
        {convos.map((c) => (
          <button
            key={c.id}
            onClick={() => nav(`/mensagens/${c.otherId}`)}
            className={cn("w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted text-left transition", otherId === c.otherId && "bg-gold/10 shadow-[inset_3px_0_0_hsl(var(--gold))]")}
          >
            <Avatar src={c.otherAvatar ?? undefined} name={c.otherName} size={44} ring={c.otherIsHouse ? "gold" : "none"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold truncate">{c.otherName}</div>
                <div className="text-[10px] text-muted-foreground shrink-0">{c.lastText && timeAgo(c.lastAt)}</div>
              </div>
              <div className="text-xs text-muted-foreground truncate">{c.lastFromAssistant ? "Assistente: " : ""}{c.lastText}</div>
            </div>
          </button>
        ))}
      </aside>

      <section className={cn("flex flex-col min-h-0", !otherId && "hidden md:flex")}>
        {otherId && peer ? (
          <>
            <header className="flex items-center gap-2 border-b border-border/70 bg-card px-2 py-2 sm:px-3 sticky top-0">
              <button type="button" aria-label="Voltar" className="md:hidden grid h-10 w-10 shrink-0 place-items-center rounded-full text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => nav("/mensagens")}>
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </button>
              <Avatar src={peer.avatar ?? undefined} name={peer.name} size={42} ring={peer.isHouse ? "gold" : "none"} />
              <div className="min-w-0 flex-1">
                {/* o nome pode ocupar até três linhas: nada de "Gustavo dos Sant…" */}
                <button onClick={() => peer.isHouse && nav(`/casa/${peer.id}`)} className={cn("block max-w-full text-left text-[15px] sm:text-base font-semibold leading-tight break-words line-clamp-3", peer.isHouse && "hover:underline")}>{peer.name}</button>
                <div className="text-xs text-muted-foreground leading-tight mt-0.5">{peer.isHouse ? (peer.online ? "Casa online" : assistantName ? "Casa offline · a assistente atende" : "Casa offline") : "Cliente"}</div>
              </div>
              <ChatSafetyMenu otherId={peer.id} otherName={peer.name} blocked={iBlocked} conversationId={convId} onBlockedChange={setIBlocked} />
            </header>

            {convId && <HandoffBar conversationId={convId} handoff={handoff} viewer={iAmHouse && peer && !peer.isHouse ? "house" : "client"} always={!!(iAmHouse && myAssistant && peer && !peer.isHouse)} onChange={() => void refreshRef.current()} />}
            <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 sm:px-4 bg-muted/30" aria-live="polite">
              {offlineHouse && assistantName && !handoff?.active && (
                <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><Bot className="h-3 w-3" /> A casa está offline agora. A assistente responde sobre serviços, rituais, vagas e valores.</div>
              )}
              {decorateMessages(msgs, (m) => (m.fromAssistant ? "assistente" : m.senderId)).map(({ message: m, newDay, sameSenderAsPrev }) => {
                const mine = m.senderId === me && !m.fromAssistant;
                const deleted = Boolean(m.deletedAt);
                return (
                  <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start", sameSenderAsPrev ? "mt-0.5" : "mt-2.5 first:mt-0")}>
                    {newDay && <div className="my-2 self-center rounded-full bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">{dayLabel(m.createdAt)}</div>}
                    <div
                      className={cn(
                        "max-w-[88%] sm:max-w-[75%] min-w-0 px-3 py-1.5 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words",
                        mine ? "bg-forest text-forest-foreground rounded-br-md shadow-card" : m.fromAssistant ? "bg-primary/10 border border-primary/20 rounded-bl-md" : "bg-card rounded-bl-md shadow-card",
                        deleted && "italic opacity-70"
                      )}
                    >
                      {m.staffName && !m.fromAssistant && <div className="text-[11px] font-semibold text-gold-ink mb-0.5">Atendido por {m.staffName}</div>}
                      {m.fromAssistant && <div className="text-[11px] font-semibold text-primary mb-0.5 flex items-center gap-1"><AssistantAvatar url={assistantAvatar} size={16} /> {assistantName ? `${assistantName} · assistente virtual` : "Assistente da casa"}</div>}
                      {deleted ? (mine ? "Você apagou esta mensagem" : "Mensagem apagada") : (
                        <>
                          {m.attachmentPath && m.attachmentType && <div className="mb-1"><ChatAttachment path={m.attachmentPath} type={m.attachmentType} name={m.attachmentName ?? "arquivo"} size={m.attachmentSize} /></div>}
                          {!(m.attachmentPath && isPlaceholderText(m.text)) && m.text}
                          {m.action && m.action.target !== "proposal" && m.fromAssistant && otherId && <div><ChatCheckoutButton action={m.action as { target: "ritual" | "service"; id: string }} ownerId={otherId} /></div>}
                          {m.action?.target === "proposal" && !m.fromAssistant && <ProposalCard proposalId={m.action.id} onChanged={() => void refreshRef.current()} />}
                        </>
                      )}
                      <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-none", mine ? "text-forest-foreground/75" : "text-muted-foreground")}>
                        {mine && !deleted && (
                          <button type="button" aria-label="Apagar mensagem" className="-my-2 -ml-1 grid h-8 w-8 place-items-center rounded-full opacity-70 hover:opacity-100 hover:bg-white/10 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" onClick={(e) => { e.stopPropagation(); askDelete(m.id); }}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                        <time dateTime={m.createdAt}>{clockTime(m.createdAt)}</time>
                        {mine && !deleted && (
                          m.read
                            ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Lida" />
                            : m.deliveredAt
                              ? <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />
                              : <Check className="h-3.5 w-3.5" aria-label="Enviada" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {msgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Inicie a conversa enviando uma mensagem.</div>}
              {busy && offlineHouse && assistantName && <div className="text-xs text-muted-foreground">{assistantName} está escrevendo…</div>}
              {notice && <div role="alert" className="text-sm text-center text-muted-foreground">{notice}</div>}
            </div>

            {!iBlocked && !mediaOk && currentUser?.type === "commercial" && (
              <ChatPremiumStrip />
            )}
            {iBlocked ? (
              <div className="p-3 border-t border-border bg-card text-sm text-center text-muted-foreground">
                Você bloqueou este contato. Use o menu (⋮) para desbloquear.
              </div>
            ) : (
              <div className="flex items-end gap-2 border-t border-border/70 bg-card px-2 py-2 sm:px-3">
                <input ref={fileRef} type="file" hidden accept={mediaOk ? "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,application/pdf" : "application/pdf"} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void attach(f); }} />
                {/* Campo único em forma de pílula, com as ações dentro (anexar, horário, respostas rápidas); o botão de enviar fica ao lado. */}
                <div className="relative flex min-w-0 flex-1 items-center rounded-full bg-muted pl-1 pr-3 focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]">
                  <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-full" aria-label={mediaOk ? "Anexar foto, vídeo ou PDF" : "Anexar PDF"} disabled={busy || !convId} onClick={() => fileRef.current?.click()}><Paperclip className="h-5 w-5" /></Button>
                  {iAmHouse && peer && !peer.isHouse && otherId && (
                    <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-full" aria-label="Propor horário" title="Propor horário" disabled={busy || !convId} onClick={() => setProposeOpen(true)}><CalendarClock className="h-5 w-5" /></Button>
                  )}
                  {iAmHouse && quick.length > 0 && (
                    <>
                      <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-full" aria-label="Respostas rápidas" aria-expanded={quickOpen} onClick={() => setQuickOpen((v) => !v)}><Zap className="h-5 w-5" /></Button>
                      {quickOpen && (
                        <ul className="pillow absolute bottom-12 left-0 z-20 w-72 max-w-[calc(100vw-1.5rem)] max-h-64 overflow-y-auto rounded-2xl bg-card p-1.5 shadow-lift">
                          {quick.map((q) => (
                            <li key={q.id}><button type="button" className="w-full rounded-xl px-3 py-2 text-left hover:bg-muted" onClick={() => { setText(q.body.slice(0, 1000)); setQuickOpen(false); }}>
                              <span className="block text-sm font-semibold">{q.title}</span><span className="block text-xs text-muted-foreground line-clamp-2">{q.body}</span>
                            </button></li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  <input
                    aria-label="Mensagem"
                    value={text}
                    maxLength={1000}
                    enterKeyHint="send"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void send()}
                    placeholder="Escreva sua mensagem..."
                    className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Button size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label="Enviar mensagem" disabled={busy || !convId} onClick={() => void send()}><Send className="h-5 w-5" /></Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm p-6 text-center">{otherId ? "Abrindo conversa…" : "Selecione uma conversa para começar."}</div>
        )}
      </section>
    </Card>
    {iAmHouse && peer && !peer.isHouse && otherId && me && (
      <ProposeScheduleModal open={proposeOpen} ownerId={me} clientId={otherId} clientName={peer.name} onClose={() => setProposeOpen(false)} onSent={() => void refreshRef.current()} />
    )}
    </div>
  );
}
