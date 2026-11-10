import { useState } from "react";
import { Bot, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/base";
import { releaseConversation, takeConversation } from "@/lib/handoff";
import { handoffView, type Handoff } from "@/lib/handoffCore";
import { cn } from "@/lib/utils";

/** Faixa que diz quem está com a conversa (assistente, casa ou equipe) e deixa a casa assumir ou devolver à assistente. */
export default function HandoffBar({ conversationId, handoff, viewer, canAct = true, onChange }: { conversationId: string; handoff: Handoff | null; viewer: "house" | "client"; canAct?: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const base = handoffView(handoff, viewer);
  const view = base && !canAct ? { ...base, action: null } : base;
  if (!view) return null;
  const run = async () => {
    if (busy || !view.action) return;
    setBusy(true);
    const ok = view.action === "take" ? await takeConversation(conversationId) : await releaseConversation(conversationId);
    setBusy(false);
    if (!ok) toast.error("Não foi possível atualizar o atendimento. Tente novamente.");
    onChange();
  };
  return (
    <div role="status" className={cn("px-3 py-2 text-xs flex items-center gap-2 border-b", view.tone === "alert" ? "bg-gold/15 border-gold/40" : "bg-muted/50 border-border")}>
      {view.action === "release" ? <UserCheck className="h-3.5 w-3.5 shrink-0" /> : <Bot className="h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1 min-w-0">{view.text}</span>
      {view.action && (
        <Button size="sm" variant="outline" disabled={busy} onClick={run}>
          {view.action === "take" ? "Assumir" : "Devolver à assistente"}
        </Button>
      )}
    </div>
  );
}
