import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Button, Card } from "@/components/base";
import { Send } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

export default function Messages() {
  const { id } = useParams();
  const { conversations, currentUser, users, sendMessage } = useApp();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const myConvos = conversations
    .filter((c) => currentUser && c.participantIds.includes(currentUser.id))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const activeOtherId = id;
  const active = activeOtherId
    ? myConvos.find((c) => c.participantIds.includes(activeOtherId)) ||
      (users.find((u) => u.id === activeOtherId)
        ? { id: "new", participantIds: [currentUser!.id, activeOtherId], messages: [], updatedAt: "" }
        : null)
    : myConvos[0] || null;

  const otherId = active?.participantIds.find((pid) => pid !== currentUser?.id);
  const other = users.find((u) => u.id === otherId);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [active?.messages.length, activeOtherId]);

  const submit = () => {
    if (!text.trim() || !otherId) return;
    sendMessage(otherId, text.trim());
    setText("");
    setTimeout(() => {
      // simulated reply for demo
      const houseName = users.find((u) => u.id === otherId)?.name;
      if (users.find((u) => u.id === otherId)?.type === "commercial") {
        sendMessage(currentUser!.id, ""); // no-op to avoid noise
      }
    }, 400);
  };

  return (
    <Card className="overflow-hidden h-[calc(100vh-6rem)] grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-display font-bold text-lg">Mensagens</h2>
        </div>
        {myConvos.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</div>}
        {myConvos.map((c) => {
          const oid = c.participantIds.find((pid) => pid !== currentUser?.id) || "";
          const o = users.find((u) => u.id === oid);
          const last = c.messages[c.messages.length - 1];
          const activeItem = otherId === oid;
          return (
            <button
              key={c.id}
              onClick={() => nav(`/mensagens/${oid}`)}
              className={cn("w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted text-left transition", activeItem && "bg-primary/5")}
            >
              <Avatar src={o?.avatar} name={o?.name} size={44} ring={o?.type === "commercial" ? "gold" : "none"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-semibold truncate">{o?.name}</div>
                  <div className="text-[10px] text-muted-foreground">{last && timeAgo(last.createdAt)}</div>
                </div>
                <div className="text-xs text-muted-foreground truncate">{last?.text}</div>
              </div>
            </button>
          );
        })}
      </aside>

      <section className="flex flex-col min-h-0">
        {active && other ? (
          <>
            <header className="p-4 border-b border-border flex items-center gap-3 sticky top-0 bg-card">
              <Avatar src={other.avatar} name={other.name} size={40} ring={other.type === "commercial" ? "gold" : "none"} />
              <div className="min-w-0 flex-1">
                <button onClick={() => other.type === "commercial" && nav(`/casa/${other.id}`)} className="font-semibold hover:underline">
                  {other.name}
                </button>
                <div className="text-xs text-muted-foreground">
                  {other.type === "commercial" ? (other as any).category : "Cliente"}
                </div>
              </div>
            </header>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30">
              {active.messages.map((m) => {
                const mine = m.from === currentUser?.id;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] px-4 py-2 rounded-2xl text-sm",
                        mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"
                      )}
                    >
                      {m.text}
                      <div className={cn("text-[10px] mt-1", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{timeAgo(m.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              {active.messages.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-10">
                  Inicie a conversa enviando uma mensagem.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border flex items-center gap-2 bg-card">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Escreva sua mensagem..."
                className="flex-1 h-11 px-4 rounded-full bg-muted border border-transparent focus:bg-background focus:border-input focus:ring-2 focus:ring-[hsl(var(--ring))] outline-none text-sm"
              />
              <Button size="icon" onClick={submit}><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">Selecione uma conversa para começar.</div>
        )}
      </section>
    </Card>
  );
}
