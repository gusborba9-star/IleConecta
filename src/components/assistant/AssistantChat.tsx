import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { askAssistant, fetchConversationLines, type ChatLine } from "@/lib/assistant";
import { cn, timeAgo } from "@/lib/utils";

const key = (userId: string, houseId: string) => `assistant-conv:${userId}:${houseId}`;

function readStored(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeStored(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: a conversa só não é retomada depois */
  }
}

/** Chat do cliente com a assistente de uma casa real. */
export default function AssistantChat({ houseId, houseName }: { houseId: string; houseName: string }) {
  const { currentUser } = useApp();
  const userId = currentUser?.id;
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [conv, setConv] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [assistantName, setAssistantName] = useState("Assistente");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    const saved = readStored(key(userId, houseId));
    if (!saved) return;
    setConv(saved);
    fetchConversationLines(saved, userId).then(setLines);
  }, [userId, houseId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines.length, busy]);

  if (!userId) return null;
  if (userId === houseId) {
    return <Card className="p-6 text-sm text-muted-foreground">Esta é a sua casa. Configure a assistente em Perfil.</Card>;
  }

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true);
    setNotice(null);
    setText("");
    const mine: ChatLine = { id: `tmp-${Date.now()}`, mine: true, text: msg, createdAt: new Date().toISOString() };
    setLines((l) => [...l, mine]);
    const res = await askAssistant(houseId, msg, conv);
    if (res.conversationId && res.conversationId !== conv) {
      setConv(res.conversationId);
      writeStored(key(userId, houseId), res.conversationId);
    }
    if (res.ok && res.reply) {
      if (res.assistantName) setAssistantName(res.assistantName);
      setLines((l) => [...l, { id: `a-${Date.now()}`, mine: false, text: res.reply!, createdAt: new Date().toISOString() }]);
    } else {
      setNotice(res.message ?? "Não foi possível responder agora.");
    }
    setBusy(false);
  };

  return (
    <Card className="overflow-hidden flex flex-col h-[28rem]">
      <header className="p-3 border-b border-border flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{assistantName} · {houseName}</div>
          <div className="text-xs text-muted-foreground">Assistente virtual. Valores e datas seguem o cadastro da casa.</div>
        </div>
      </header>
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30">
        {lines.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">Pergunte sobre serviços, rituais, valores e horários.</div>
        )}
        {lines.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap",
                m.mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"
              )}
            >
              {m.text}
              <div className={cn("text-[10px] mt-1", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{timeAgo(m.createdAt)}</div>
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground">{assistantName} está escrevendo…</div>}
        {notice && <div role="alert" className="text-sm text-center text-destructive">{notice}</div>}
      </div>
      <div className="p-3 border-t border-border flex items-center gap-2 bg-card">
        <input
          aria-label="Mensagem para a assistente"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Escreva sua mensagem..."
          className="flex-1 h-11 px-4 rounded-full bg-muted border border-transparent focus:bg-background focus:border-input focus:ring-2 focus:ring-[hsl(var(--ring))] outline-none text-sm"
        />
        <Button size="icon" aria-label="Enviar mensagem" disabled={busy} onClick={send}><Send className="h-4 w-4" /></Button>
      </div>
    </Card>
  );
}
