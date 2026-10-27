import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Label, Modal, Textarea } from "@/components/base";
import type { Service } from "@/lib/services";
import { createOrder } from "@/lib/serviceOrders";
import { formatCents } from "@/lib/servicesCore";

interface Props {
  service: Service | null;
  houseName?: string;
  onClose: () => void;
  onDone: () => void;
}

export default function ContractModal({ service, onClose, onDone }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote("");
    setSaving(false);
  }, [service]);

  if (!service) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const error = await createOrder(service.id, note);
    setSaving(false);
    if (error) return void toast.error(error);
    toast.success("Pedido enviado! A casa será avisada.");
    onDone();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Contratar — ${service.title}`} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="order-note">Conte à casa o que você precisa (opcional)</Label>
          <Textarea id="order-note" rows={4} maxLength={800} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Seu nome, a situação e o que deseja do trabalho. Só a casa vê." />
        </div>
        <p className="text-xs text-muted-foreground">
          Valor: {formatCents(service.priceCents)}. A casa inicia e conclui o trabalho e você é avisado em cada etapa. Por enquanto não há cobrança no app: o pagamento é combinado com a casa.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Enviando…" : "Enviar pedido"}</Button>
        </div>
      </form>
    </Modal>
  );
}
