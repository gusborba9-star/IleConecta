import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/base";
import { REPORT_REASONS, reportUser, setBlocked } from "@/lib/messaging";

interface Props {
  otherId: string;
  otherName: string;
  blocked: boolean;
  onBlockedChange: (blocked: boolean) => void;
}

/** Menu do chat: bloquear/desbloquear e denunciar. */
export default function ChatSafetyMenu({ otherId, otherName, blocked, onBlockedChange }: Props) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [details, setDetails] = useState("");
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

  const sendReport = async () => {
    if (reason === "outro" && details.trim().length < 10) return void toast.error("Conte o que aconteceu (pelo menos 10 letras) para a equipe poder avaliar.");
    setBusy(true);
    const ok = await reportUser(otherId, reason, details.trim());
    setBusy(false);
    if (!ok) return void toast.error("Não foi possível enviar a denúncia. Tente novamente.");
    setReporting(false);
    setDetails("");
    toast.success("Denúncia enviada. A equipe vai avaliar.");
  };

  return (
    <div className="relative">
      <button type="button" aria-label="Mais opções" disabled={busy} onClick={() => setOpen((v) => !v)} className="p-2 rounded-full hover:bg-muted">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-border bg-card shadow-lg py-1 text-sm">
          <button className="w-full text-left px-4 py-2 hover:bg-muted" onClick={() => void toggleBlock()}>{blocked ? "Desbloquear" : "Bloquear"}</button>
          <button className="w-full text-left px-4 py-2 hover:bg-muted text-destructive" onClick={() => { setOpen(false); setReporting(true); }}>Denunciar</button>
        </div>
      )}
      {reporting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Denunciar">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 space-y-3">
            <h2 className="font-display font-bold text-lg">Denunciar {otherName}</h2>
            <p className="text-xs text-muted-foreground">
              Ao denunciar, as últimas 30 mensagens desta conversa são enviadas à equipe do Ilê Conecta para avaliação. Fora isso, as conversas continuam privadas.
            </p>
            <label className="block text-sm font-semibold" htmlFor="rp-reason">Motivo</label>
            <select id="rp-reason" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <label className="block text-sm font-semibold" htmlFor="rp-details">{reason === "outro" ? "Conte o que aconteceu" : "Detalhes (opcional)"}</label>
            <textarea id="rp-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReporting(false)} disabled={busy}>Cancelar</Button>
              <Button onClick={() => void sendReport()} disabled={busy}>{busy ? "Enviando…" : "Enviar denúncia"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
