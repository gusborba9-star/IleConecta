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
import { createBooking, createOrder, setOrderModality } from "@/lib/serviceOrders";
import { goToCheckout } from "@/lib/payments";
import { formatCents } from "@/lib/servicesCore";
import PlatformBenefits from "@/components/PlatformBenefits";
import { stagePlan } from "@/lib/paymentsCore";
import { fetchSlots } from "@/lib/agenda";
import { formatSlot, groupSlots } from "@/lib/agendaCore";

interface Props {
  service: Service | null;
  houseName?: string;
  /** Horário já escolhido no card (ISO); abre a tela com ele marcado. */
  initialSlot?: string;
  onClose: () => void;
  onDone: () => void;
}

export default function ContractModal({ service, initialSlot, onClose, onDone }: Props) {
  const [note, setNote] = useState("");
  const [modality, setModality] = useState<"presencial" | "distancia" | "">("");
  const [saving, setSaving] = useState(false);
  const { id: ownerId } = useParams();
  const [payOn, setPayOn] = useState(false);
  const [okCheckout, setOkCheckout] = useState(false);
  const [okSensitive, setOkSensitive] = useState(false);
  const { currentUser } = useApp();
  const [termsDone, setTermsDone] = useState(false);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [dayPick, setDayPick] = useState("");

  useEffect(() => {
    setNote("");
    setModality("");
    setSaving(false);
    setOkCheckout(false);
    setOkSensitive(false);
    setSlots(null);
    setSlot("");
    setDayPick("");
    if (!service) return;
    let alive = true;
    if (service.bookable) {
      void fetchSlots(service.id).then((r) => {
        if (!alive) return;
        setSlots(r);
        // Horário escolhido no card: só vale se ainda estiver livre.
        if (initialSlot && r.includes(initialSlot)) {
          setSlot(initialSlot);
          setDayPick(groupSlots(r).find((d) => d.slots.some((x) => x.iso === initialSlot))?.day ?? "");
        }
      });
    }
    void paymentsEnabledFor(ownerId).then((v) => alive && setPayOn(v));
    if (currentUser?.id) void fetchAcceptedDocs(currentUser.id).then((d) => alive && setTermsDone(d.has("termos_cliente")));
    return () => {
      alive = false;
    };
  }, [service, initialSlot, ownerId, currentUser?.id]);

  if (!service) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!okSensitive || (payOn && !termsDone && !okCheckout)) return void toast.error("Marque os aceites para continuar.");
    if (service.bookable && !slot) return void toast.error("Escolha o dia e o horário.");
    if (service.delivery === "hibrido" && !modality) return void toast.error("Escolha como quer receber: presencial ou à distância.");
    setSaving(true);
    const consentError = await recordConsents(payOn ? CHECKOUT_DOCS.servico.filter((d) => !(termsDone && d === "termos_cliente")) : ["dados_sensiveis"], service.id);
    if (consentError) {
      setSaving(false);
      return void toast.error(consentError);
    }
    const { error, id } = service.bookable ? await createBooking(service.id, slot, note) : await createOrder(service.id, note);
    if (error) {
      setSaving(false);
      return void toast.error(error);
    }
    if (service.delivery === "hibrido" && modality && id) {
      const modError = await setOrderModality(id, modality);
      if (modError) toast.error(`${modError} Avise a casa pelo chat como prefere receber.`);
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
        {service.bookable && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Escolha o dia e o horário</legend>
            {slots === null && <p className="text-sm text-muted-foreground">Carregando horários…</p>}
            {slots && slots.length === 0 && <p className="text-sm text-muted-foreground">Não há horários livres nos próximos dias. Fale com a casa pelo chat.</p>}
            {slots && slots.length > 0 && (() => {
              const days = groupSlots(slots);
              const current = days.find((d) => d.day === dayPick) ?? null;
              return (
                <>
                  <div className="flex flex-wrap gap-2">
                    {days.map((d) => (
                      <button key={d.day} type="button" onClick={() => { setDayPick(d.day); setSlot(""); }}
                        className={`px-3 min-h-10 rounded-full border text-sm ${dayPick === d.day ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{d.label}</button>
                    ))}
                  </div>
                  {current && (
                    <div className="flex flex-wrap gap-2">
                      {current.slots.map((s) => (
                        <button key={s.iso} type="button" onClick={() => setSlot(s.iso)}
                          className={`px-3 min-h-10 rounded-lg border text-sm ${slot === s.iso ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{s.time}</button>
                      ))}
                    </div>
                  )}
                  {slot && <p className="text-sm">Horário escolhido: <strong>{formatSlot(slot)}</strong> (Brasília)</p>}
                </>
              );
            })()}
          </fieldset>
        )}
        {service.delivery === "hibrido" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Como você quer receber?</legend>
            {([["presencial", "Presencial", "Você vai até a casa; horário combinado com ela."], ["distancia", "À distância", "Por vídeo, chamada ou transmissão."]] as const).map(([id, label, hint]) => (
              <label key={id} className={`cursor-pointer rounded-xl border p-3 flex gap-3 items-start ${modality === id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                <input type="radio" name="modality" className="mt-1 h-4 w-4" checked={modality === id} onChange={() => setModality(id)} />
                <span><span className="block text-sm font-semibold">{label}</span><span className="block text-sm text-muted-foreground">{hint}</span></span>
              </label>
            ))}
          </fieldset>
        )}
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
        {payOn && <PlatformBenefits />}
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
          <Button type="submit" disabled={saving}>{saving ? "Enviando…" : service.bookable ? "Agendar" : "Enviar pedido"}</Button>
        </div>
      </form>
    </Modal>
  );
}
