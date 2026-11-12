import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button, Input, Label, Modal, Textarea } from "@/components/base";
import { openCase, type OpenInput } from "@/lib/support";
import { CONSENT_TEXT, DESC_MAX, KINDS, TITLE_MAX, priorityText, validateReport } from "@/lib/supportCore.js";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tipo já escolhido (ex.: "abuso" vindo do chat). */
  defaultKind?: string;
  /** Rascunho vindo da assistente Conecta; a pessoa revisa antes de enviar. */
  defaultTitle?: string;
  defaultDescription?: string;
  source?: "pessoa" | "assistente";
  contextType?: OpenInput["contextType"];
  contextId?: string | null;
  /** Pessoa envolvida (contra quem). */
  subject?: string | null;
  subjectName?: string;
}

const GROUPS = ["Segurança", "Dinheiro", "Conta e dados", "Outros"];

/** "Relatar ocorrência": porta única para denúncia, conflito, fraude, pagamento, conta e dúvida. */
export default function ReportOccurrence({ open, onClose, defaultKind, defaultTitle = "", defaultDescription = "", source = "pessoa", contextType = null, contextId = null, subject = null, subjectName }: Props) {
  const nav = useNavigate();
  const [kind, setKind] = useState(defaultKind ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setKind(defaultKind ?? ""); setTitle(defaultTitle); setDescription(defaultDescription); setConsent(false); }
  }, [open, defaultKind, defaultTitle, defaultDescription]);

  const hasContext = Boolean(contextType && contextId);
  const picked = KINDS.find((k) => k.id === kind);

  const send = async () => {
    const err = validateReport({ kind, title, description, consent });
    if (err) return void toast.error(err);
    setBusy(true);
    const r = await openCase({ kind, title, description, contextType, contextId, subject, source });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Ocorrência enviada. Você acompanha em “Meus chamados”.");
    onClose();
    nav("/suporte/chamados");
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={subjectName ? `Relatar ocorrência · ${subjectName}` : "Relatar ocorrência"} maxWidth="max-w-xl">
      <div className="space-y-3">
        <div>
          <Label htmlFor="ro-kind">O que aconteceu?</Label>
          <select id="ro-kind" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="" disabled>Escolha o tipo</option>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>{KINDS.filter((k) => k.group === g).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</optgroup>
            ))}
          </select>
          {picked && <p className="text-xs text-muted-foreground mt-1">{picked.help} Resposta: {priorityText(picked.id, picked.priority)}.</p>}
        </div>
        {kind === "risco_vida" && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            Se há perigo agora, ligue <strong>190</strong> (polícia) ou <strong>192</strong> (SAMU). Para apoio emocional, <strong>188</strong> (CVV). Enviar aqui avisa a equipe na hora, mas não substitui o socorro.
          </p>
        )}
        <div>
          <Label htmlFor="ro-title">Título</Label>
          <Input id="ro-title" maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resuma em uma frase" />
        </div>
        <div>
          <Label htmlFor="ro-desc">Conte o que aconteceu</Label>
          <Textarea id="ro-desc" rows={5} maxLength={DESC_MAX} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Datas, valores, o que foi combinado e o que não foi cumprido." />
          <div className="text-[11px] text-muted-foreground text-right">{description.length}/{DESC_MAX}</div>
        </div>
        {hasContext && <p className="text-xs text-muted-foreground">Este relato fica ligado ao item de onde você veio, para a equipe ver os fatos reais.</p>}
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{CONSENT_TEXT}</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void send()} disabled={busy}>{busy ? "Enviando…" : "Enviar ocorrência"}</Button>
        </div>
      </div>
    </Modal>
  );
}
