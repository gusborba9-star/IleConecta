import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Label, Modal, Textarea } from "@/components/base";
import { requestRefund } from "@/lib/refunds";
import { composeReason, REFUND_REASONS, type RefundReasonId } from "@/lib/refundsCore";

interface Props {
  /** O que está sendo reportado: reserva de ritual ou pedido de serviço. */
  target: { kind: "reserva" | "pedido"; id: string; title: string } | null;
  onClose: () => void;
  onDone: () => void;
}

export default function RefundModal({ target, onClose, onDone }: Props) {
  const [reasonId, setReasonId] = useState<RefundReasonId | null>(null);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReasonId(null);
    setDetails("");
    setSaving(false);
  }, [target]);

  if (!target) return null;
  const composed = reasonId ? composeReason(reasonId, details) : null;
  const ready = composed !== null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!composed) return;
    setSaving(true);
    const error = await requestRefund(target.kind, target.id, composed);
    setSaving(false);
    if (error) return void toast.error(error);
    toast.success("Relato enviado. Você será avisado da decisão.");
    onDone();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Relatar problema com a entrega — ${target.title}`} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm rounded-md border border-border bg-muted/40 p-3">
          <strong>Importante:</strong> depois que o ritual ou trabalho começou, o reembolso só vale quando a casa <strong>não entregou o combinado</strong>. Insatisfação com o resultado não gera reembolso.
        </p>
        <fieldset>
          <legend className="text-sm font-medium mb-2">O que aconteceu?</legend>
          <div className="space-y-2">
            {REFUND_REASONS.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name="refund-reason" className="mt-1" checked={reasonId === r.id} onChange={() => setReasonId(r.id)} />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="refund-details">Conte os detalhes</Label>
          <Textarea
            id="refund-details"
            rows={4}
            maxLength={700}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Descreva o que foi combinado e o que não aconteceu (mínimo de 10 caracteres)."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          A equipe analisa o seu relato e você é avisado da decisão. Enquanto isso, o valor fica retido e não é repassado à casa. O relato pode ser feito até 7 dias após a conclusão. Relatos sem fundamento são recusados.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Voltar</Button>
          <Button type="submit" disabled={saving || !ready}>{saving ? "Enviando…" : "Enviar relato"}</Button>
        </div>
      </form>
    </Modal>
  );
}
