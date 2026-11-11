import { useState } from "react";
import { Bot, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { releaseConversation, takeConversation } from "@/lib/handoff";
import { handoffView, type Handoff } from "@/lib/handoffCore";
import { cn } from "@/lib/utils";

/**
 * Faixa fina de uma linha, logo abaixo do cabeçalho do chat: diz quem está com a conversa (assistente, casa ou equipe)
 * e deixa a casa assumir ou devolver à assistente. Com `always` (casa com assistente) fica sempre no lugar, sem pular na tela.
 */
export default function HandoffBar({ conversationId, handoff, viewer, canAct = true, always = false, onChange }: {
  conversationId: string; handoff: Handoff | null; viewer: "house" | "client"; canAct?: boolean; always?: boolean; onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const loading = handoff === null;
  const base = loading ? (viewer === "house" && always ? { tone: "info" as const, text: "Verificando atendimento…", action: null, label: "" } : null) : handoffView(handoff, viewer, { always });
  const view = base && !canAct ? { ...base, action: null, alt: undefined } : base;
  if (!view) return null;
  const alt = view.alt;
  const run = async (action: "take" | "release" | null = view.action as "take" | "release" | null) => {
    if (busy || !action) return;
    setBusy(true);
    const ok = action === "take" ? await takeConversation(conversationId) : await releaseConversation(conversationId);
    setBusy(false);
    if (!ok) toast.error("Não foi possível atualizar o atendimento. Tente novamente.");
    onChange();
  };
  return (
    <div role="status" className={cn("h-9 px-3 text-xs flex items-center gap-2 border-b shrink-0", view.tone === "alert" ? "bg-gold/15 border-gold/40" : "bg-muted/50 border-border")}>
      {view.action === "release" ? <UserCheck className="h-3.5 w-3.5 shrink-0" /> : <Bot className="h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1 min-w-0 truncate">{view.text}</span>
      {alt && (
        <button type="button" disabled={busy} onClick={() => void run(alt.action as "release")}
          className="shrink-0 h-7 px-3 rounded-full border border-border bg-card text-xs font-semibold hover:bg-muted disabled:opacity-60 touch-manipulation">
          {alt.label}
        </button>
      )}
      {view.action && (
        <button type="button" disabled={busy} onClick={() => void run()}
          className="shrink-0 h-7 px-3 rounded-full border border-border bg-card text-xs font-semibold hover:bg-muted disabled:opacity-60 touch-manipulation">
          {view.label}
        </button>
      )}
    </div>
  );
}
