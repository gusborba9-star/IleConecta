import { useConfirm } from "@/components/base/Confirm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bot, Check, CheckCheck, Paperclip, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card } from "@/components/base";
import ChatAttachment from "@/components/chat/ChatAttachment";
import ChatCheckoutButton from "@/components/chat/ChatCheckoutButton";
import ChatSafetyMenu from "@/components/chat/ChatSafetyMenu";
import { useApp } from "@/contexts/AppContext";
import { askAssistant } from "@/lib/assistant";
import { fetchAssistantName } from "@/lib/catalog";
import { isPlaceholderText, prepareFile, sendAttachment, uploadFile } from "@/lib/chatFiles";
import {
  deleteMessage, fetchIBlocked, fetchMessages, fetchPeer, markConversationRead, listConversations, openConversation, sendDirect, subscribeMessages,
  type ChatMessage, type ConversationRow, type Peer,
} from "@/lib/messaging";
import { cn, timeAgo } from "@/lib/utils";

/** Mensagens reais. Se a casa estiver offline, a assistente dela atende primeiro. */
export default function RealMessages() {
  const confirm = useConfirm();
  const { id: otherId } = useParams();
  const { currentUser } = useApp();
  const nav = useNavigate();
  const me = currentUser?.id;
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [assistantName, setAssistantName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
  useEffect(() => {
    if (!otherId || !peerIsHouse) {
      setAssistantName(null);
      return;
    }
    let alive = true;
    void fetchAssistantName(otherId).then((n) => alive && setAssistantName(n));
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
    const fresh = await fetchPeer(otherId);
    if (fresh) setPeer(fresh);
    const houseOffline = Boolean(fresh?.isHouse && !fresh.online);
    let delivered = false;
    if (houseOffline && assistantName) {
      // A casa está offline e tem assistente disponível: ela responde (a função grava a pergunta e a resposta).
      const res = await askAssistant(otherId, msg, convId);
      delivered = res.ok;
      if (!res.ok) setNotice(res.message ? `${res.message} A casa verá a sua mensagem quando voltar.` : null);
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

  const attach = async (file: File | undefined) => {
    if (!file || !convId || !me || busy) return;
    setBusy(true);
    setNotice(null);
    const prep = await prepareFile(file);
    if (!prep.ok) {
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
    setSelected(null);
    const ok = await deleteMessage(id);
    if (!ok) toast.error("Não foi possível apagar. Só dá para apagar mensagens suas dos últimos 2 dias.");
    await refreshRef.current();
  };

  /** Lixeira: pergunta e apaga na hora (funciona igual para texto, foto e PDF). */
  const askDelete = (id: string) => {
    setSelected(null);
    void confirm({ title: "Apagar esta mensagem?", message: "Ela some para todos na conversa.", confirmLabel: "Apagar", danger: true }).then((ok) => { if (ok) void removeMsg(id); });
  };

  const offlineHouse = Boolean(peer?.isHouse && !peer.online);

  return (
    <div ref={rootRef} className="scroll-mt-20">
    <Card className="overflow-hidden h-[calc(100dvh-6rem)] grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className={cn("border-r border-border overflow-y-auto", otherId && "hidden md:block")}>
        <div className="p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-display font-bold text-lg">Mensagens</h2>
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
            <header className="p-3 border-b border-gold/40 flex items-center gap-3 sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--gold)/0.25)]">
              <button className="md:hidden text-sm font-semibold text-primary px-2" onClick={() => nav("/mensagens")}>Voltar</button>
              <Avatar src={peer.avatar ?? undefined} name={peer.name} size={40} ring={peer.isHouse ? "gold" : "none"} />
              <div className="min-w-0 flex-1">
                <button onClick={() => peer.isHouse && nav(`/casa/${peer.id}`)} className="font-semibold hover:underline truncate block max-w-full text-left">{peer.name}</button>
                <div className="text-xs text-muted-foreground">{peer.isHouse ? (peer.online ? "Casa online" : assistantName ? "Casa offline · a assistente atende" : "Casa offline") : "Cliente"}</div>
              </div>
              <ChatSafetyMenu otherId={peer.id} otherName={peer.name} blocked={iBlocked} onBlockedChange={setIBlocked} />
            </header>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30" aria-live="polite">
              {offlineHouse && assistantName && (
                <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><Bot className="h-3 w-3" /> A casa está offline agora. A assistente responde sobre serviços, rituais, vagas e valores.</div>
              )}
              {msgs.map((m) => {
                const mine = m.senderId === me && !m.fromAssistant;
                const deleted = Boolean(m.deletedAt);
                return (
                  <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                    <div className={cn("flex items-center gap-1 max-w-full", mine && "justify-end")}>
                    {mine && !deleted && (
                      <button type="button" aria-label="Apagar mensagem" className="relative z-10 p-3 -m-1 rounded-full text-muted-foreground hover:bg-muted active:bg-muted touch-manipulation" onClick={(e) => { e.stopPropagation(); askDelete(m.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <div
                      onClick={() => mine && !deleted && setSelected(selected === m.id ? null : m.id)}
                      className={cn("max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap", mine ? "bg-forest text-forest-foreground rounded-br-md cursor-pointer shadow-card" : "bg-card border border-border rounded-bl-md shadow-[0_0_0_1px_hsl(22_30%_20%/0.04)]", deleted && "italic opacity-70")}
                    >
                      {m.fromAssistant && <div className="text-[10px] font-semibold text-primary mb-0.5 flex items-center gap-1"><Bot className="h-3 w-3" /> {assistantName ? `${assistantName} · assistente virtual` : "Assistente da casa"}</div>}
                      {deleted ? (mine ? "Você apagou esta mensagem" : "Mensagem apagada") : (
                        <>
                          {m.attachmentPath && m.attachmentType && <div className="mb-1"><ChatAttachment path={m.attachmentPath} type={m.attachmentType} name={m.attachmentName ?? "arquivo"} size={m.attachmentSize} /></div>}
                          {!(m.attachmentPath && isPlaceholderText(m.text)) && m.text}
                          {m.action && m.fromAssistant && otherId && <div><ChatCheckoutButton action={m.action} ownerId={otherId} /></div>}
                        </>
                      )}
                      <div className={cn("text-[10px] mt-1 flex items-center gap-1", mine ? "justify-end text-forest-foreground/70" : "text-muted-foreground")}>
                        {timeAgo(m.createdAt)}
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
                    {mine && selected === m.id && (
                      <div className="flex gap-3 mt-1 text-xs">
                        <button className="font-semibold text-destructive" onClick={() => void removeMsg(m.id)}>Apagar para todos</button>
                        <button className="text-muted-foreground" onClick={() => setSelected(null)}>Cancelar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {msgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Inicie a conversa enviando uma mensagem.</div>}
              {busy && offlineHouse && assistantName && <div className="text-xs text-muted-foreground">{assistantName} está escrevendo…</div>}
              {notice && <div role="alert" className="text-sm text-center text-muted-foreground">{notice}</div>}
            </div>

            {iBlocked ? (
              <div className="p-3 border-t border-border bg-card text-sm text-center text-muted-foreground">
                Você bloqueou este contato. Use o menu (⋮) para desbloquear.
              </div>
            ) : (
              <div className="p-3 border-t border-border flex items-center gap-2 bg-card">
                <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void attach(f); }} />
                <Button size="icon" variant="ghost" aria-label="Anexar foto ou PDF" disabled={busy || !convId} onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
                <input
                  aria-label="Mensagem"
                  value={text}
                  maxLength={1000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void send()}
                  placeholder="Escreva sua mensagem..."
                  className="flex-1 h-11 px-4 rounded-full bg-muted border border-transparent focus:bg-background focus:border-input focus:ring-2 focus:ring-[hsl(var(--ring))] outline-none text-sm"
                />
                <Button size="icon" aria-label="Enviar mensagem" disabled={busy || !convId} onClick={() => void send()}><Send className="h-4 w-4" /></Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm p-6 text-center">{otherId ? "Abrindo conversa…" : "Selecione uma conversa para começar."}</div>
        )}
      </section>
    </Card>
    </div>
  );
}
