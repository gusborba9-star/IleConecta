import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Button, Label, Modal, Textarea } from "@/components/base";
import ConsentBox from "@/components/legal/ConsentBox";
import { fetchAcceptedDocs, paymentsEnabledFor, recordConsents } from "@/lib/consents";
import { useApp } from "@/contexts/AppContext";
import { Link } from "react-router-dom";
import { CHECKOUT_DOCS } from "@/lib/legalCore";
import type { Service } from "@/lib/services";
import { createOrder } from "@/lib/serviceOrders";
import { goToCheckout } from "@/lib/payments";
import { formatCents } from "@/lib/servicesCore";
import { stagePlan } from "@/lib/paymentsCore";

interface Props {
  service: Service | null;
  houseName?: string;
  onClose: () => void;
  onDone: () => void;
}

export default function ContractModal({ service, onClose, onDone }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { id: ownerId } = useParams();
  const [payOn, setPayOn] = useState(false);
  const [okCheckout, setOkCheckout] = useState(false);
  const [okSensitive, setOkSensitive] = useState(false);
  const { currentUser } = useApp();
  const [termsDone, setTermsDone] = useState(false);

  useEffect(() => {
    setNote("");
    setSaving(false);
    setOkCheckout(false);
    setOkSensitive(false);
    if (!service) return;
    let alive = true;
    void paymentsEnabledFor(ownerId).then((v) => alive && setPayOn(v));
    if (currentUser?.id) void fetchAcceptedDocs(currentUser.id).then((d) => alive && setTermsDone(d.has("termos_cliente")));
    return () => {
      alive = false;
    };
  }, [service, ownerId, currentUser?.id]);

  if (!service) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!okSensitive || (payOn && !termsDone && !okCheckout)) return void toast.error("Marque os aceites para continuar.");
    setSaving(true);
    const consentError = await recordConsents(payOn ? CHECKOUT_DOCS.servico.filter((d) => !(termsDone && d === "termos_cliente")) : ["dados_sensiveis"], service.id);
    if (consentError) {
      setSaving(false);
      return void toast.error(consentError);
    }
    const { error, id } = await createOrder(service.id, note);
    if (error) {
      setSaving(false);
      return void toast.error(error);
    }
    if (payOn && id) {
      toast.success("Pedido enviado! Abrindo o pagamento…");
      const payError = await goToCheckout({ orderId: id });
      if (payError) {
        setSaving(false);
        toast.error(`${payError} Seu pedido ficou registrado; tente pagar de novo em instantes.`);
        onDone();
        onClose();
      }
      return;
    }
    setSaving(false);
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
          Valor: {formatCents(service.priceCents)}. A casa inicia e conclui o trabalho e você é avisado em cada etapa.{" "}
          {payOn ? "O pagamento é feito pela plataforma, logo após o pedido. Você cancela com reembolso integral até a casa iniciar o trabalho." : "Por enquanto não há cobrança no app: o pagamento é combinado com a casa."}
        </p>
        {payOn && service.stages > 1 && (
          <p className="text-sm rounded-xl border border-border p-3">
            Pagamento em {service.stages} etapas: {stagePlan(service.priceCents, service.stages).map((v) => formatCents(v)).join(" + ")}.
            Você paga a 1ª etapa agora; as seguintes são combinadas com a casa e você as paga pelo seu pedido.
          </p>
        )}
        {payOn && !termsDone && <ConsentBox doc="termos_cliente" checked={okCheckout} onChange={setOkCheckout} />}
        {payOn && termsDone && (
          <p className="text-xs text-muted-foreground">
            Você já aceitou os Termos do cliente.{" "}
            <Link to="/sobre/termos-do-cliente" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver os termos</Link>
          </p>
        )}
        <ConsentBox doc="dados_sensiveis" checked={okSensitive} onChange={setOkSensitive} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Enviando…" : "Enviar pedido"}</Button>
        </div>
      </form>
    </Modal>
  );
}
