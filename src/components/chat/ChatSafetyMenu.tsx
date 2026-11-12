import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import ReportOccurrence from "@/components/support/ReportOccurrence";
import { setBlocked } from "@/lib/messaging";

interface Props {
  otherId: string;
  otherName: string;
  blocked: boolean;
  /** Conversa atual: liga a ocorrência às mensagens reais. */
  conversationId?: string | null;
  onBlockedChange: (blocked: boolean) => void;
}

/** Menu do chat: bloquear/desbloquear e denunciar. */
export default function ChatSafetyMenu({ otherId, otherName, blocked, conversationId, onBlockedChange }: Props) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleBlock = async () => {
    setOpen(false);
    setBusy(true);
    const ok = await setBlocked(otherId, !blocked);
    setBusy(false);
    if (!ok) return void toast.error("Não foi possível concluir. Tente novamente.");
    onBlockedChange(!blocked);
    toast.success(blocked ? `${otherName} desbloqueado.` : `${otherName} bloqueado. Essa pessoa não consegue mais enviar mensagens para você.`);
  };

  return (
    <div className="relative">
      <button type="button" aria-label="Mais opções" disabled={busy} onClick={() => setOpen((v) => !v)} className="p-2 rounded-full hover:bg-muted">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-border bg-card shadow-lg py-1 text-sm pillow">
          <button className="w-full text-left px-4 py-2 hover:bg-muted" onClick={() => void toggleBlock()}>{blocked ? "Desbloquear" : "Bloquear"}</button>
          <button className="w-full text-left px-4 py-2 hover:bg-muted text-destructive" onClick={() => { setOpen(false); setReporting(true); }}>Relatar ocorrência</button>
        </div>
      )}
      <ReportOccurrence open={reporting} onClose={() => setReporting(false)} contextType={conversationId ? "conversa" : null} contextId={conversationId ?? null} subject={otherId} subjectName={otherName} />
    </div>
  );
}
