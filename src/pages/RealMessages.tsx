import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { askAssistant } from "@/lib/assistant";
import {
  fetchMessages, fetchPeer, listConversations, openConversation, sendDirect, subscribeMessages,
  type ChatMessage, type ConversationRow, type Peer,
} from "@/lib/messaging";
import { cn, timeAgo } from "@/lib/utils";

/** Mensagens reais. Se a casa estiver offline, a assistente dela atende primeiro. */
export default function RealMessages() {
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
  const listRef = useRef<HTMLDivElement>(null);

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
      if (cid) setMsgs(await fetchMessages(cid));
    })();
    return () => {
      alive = false;
    };
  }, [otherId, me]);

  const refreshThread = useCallback(async () => {
    if (convId) setMsgs(await fetchMessages(convId));
    if (otherId) setPeer(await fetchPeer(otherId));
    await refreshList();
  }, [convId, otherId, refreshList]);

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
    if (houseOffline) {
      // A casa está offline: a assistente responde (a função grava a pergunta e a resposta).
      const res = await askAssistant(otherId, msg, convId);
      delivered = res.ok;
      if (!res.ok) setNotice(res.message ? `${res.message} A casa verá a sua mensagem quando voltar.` : null);
    }
    if (!delivered) {
      const ok = await sendDirect(convId, me, msg);
      if (!ok) {
        toast.error("Não foi possível enviar. Tente novamente.");
        setText(msg);
      } else if (houseOffline && !notice) setNotice("A casa está offline e verá a sua mensagem quando voltar.");
    }
    await refreshRef.current();
    setBusy(false);
  };

  const offlineHouse = Boolean(peer?.isHouse && !peer.online);

  return (
    <Card className="overflow-hidden h-[calc(100vh-6rem)] grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className={cn("border-r border-border overflow-y-auto", otherId && "hidden md:block")}>
        <div className="p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-display font-bold text-lg">Mensagens</h2>
        </div>
        {convos.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa ainda. Abra a página de uma casa e toque em Chat.</div>}
        {convos.map((c) => (
          <button
            key={c.id}
            onClick={() => nav(`/mensagens/${c.otherId}`)}
            className={cn("w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted text-left transition", otherId === c.otherId && "bg-primary/5")}
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
            <header className="p-3 border-b border-border flex items-center gap-3 sticky top-0 bg-card">
              <button className="md:hidden text-sm font-semibold text-primary px-2" onClick={() => nav("/mensagens")}>Voltar</button>
              <Avatar src={peer.avatar ?? undefined} name={peer.name} size={40} ring={peer.isHouse ? "gold" : "none"} />
              <div className="min-w-0 flex-1">
                <button onClick={() => peer.isHouse && nav(`/casa/${peer.id}`)} className="font-semibold hover:underline truncate block max-w-full text-left">{peer.name}</button>
                <div className="text-xs text-muted-foreground">{peer.isHouse ? (peer.online ? "Casa online" : "Casa offline · a assistente atende") : "Cliente"}</div>
              </div>
            </header>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30" aria-live="polite">
              {offlineHouse && (
                <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><Bot className="h-3 w-3" /> A casa está offline agora. A assistente responde sobre serviços, rituais, vagas e valores.</div>
              )}
              {msgs.map((m) => {
                const mine = m.senderId === me && !m.fromAssistant;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md")}>
                      {m.fromAssistant && <div className="text-[10px] font-semibold text-primary mb-0.5 flex items-center gap-1"><Bot className="h-3 w-3" /> Assistente da casa</div>}
                      {m.text}
                      <div className={cn("text-[10px] mt-1", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{timeAgo(m.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              {msgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-10">Inicie a conversa enviando uma mensagem.</div>}
              {busy && offlineHouse && <div className="text-xs text-muted-foreground">A assistente está escrevendo…</div>}
              {notice && <div role="alert" className="text-sm text-center text-muted-foreground">{notice}</div>}
            </div>

            <div className="p-3 border-t border-border flex items-center gap-2 bg-card">
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
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm p-6 text-center">{otherId ? "Abrindo conversa…" : "Selecione uma conversa para começar."}</div>
        )}
      </section>
    </Card>
  );
}
