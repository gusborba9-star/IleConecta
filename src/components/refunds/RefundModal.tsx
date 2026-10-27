import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Label, Modal, Textarea } from "@/components/base";
import { requestRefund } from "@/lib/refunds";

interface Props {
  /** O que está sendo reembolsado: reserva de ritual ou pedido de serviço. */
  target: { kind: "reserva" | "pedido"; id: string; title: string } | null;
  onClose: () => void;
  onDone: () => void;
}

export default function RefundModal({ target, onClose, onDone }: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason("");
    setSaving(false);
  }, [target]);

  if (!target) return null;
  const ready = reason.trim().length >= 10;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    const error = await requestRefund(target.kind, target.id, reason.trim());
    setSaving(false);
    if (error) return void toast.error(error);
    toast.success("Pedido enviado. Você será avisado da decisão.");
    onDone();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Pedir reembolso — ${target.title}`} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="refund-reason">O que aconteceu?</Label>
          <Textarea
            id="refund-reason"
            rows={5}
            maxLength={800}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Conte o motivo com clareza (mínimo de 10 caracteres). Quanto mais detalhes, mais rápida a análise."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          A equipe analisa o seu pedido e você é avisado da decisão. Enquanto isso, o valor fica retido e não é repassado à casa. Insatisfação sem falha na entrega não gera reembolso. O pedido pode ser feito até 7 dias após a conclusão.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Voltar</Button>
          <Button type="submit" disabled={saving || !ready}>{saving ? "Enviando…" : "Enviar pedido"}</Button>
        </div>
      </form>
    </Modal>
  );
}
