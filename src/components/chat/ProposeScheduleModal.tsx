import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button, Input, Label, Modal } from "@/components/base";
import { fetchBusyItems } from "@/lib/agenda";
import type { BusyItem } from "@/lib/agendaCore";
import { brasiliaToIso, checkProposalSlot, proposeSchedule, type SlotCheck } from "@/lib/proposals";
import { fetchServices, type Service } from "@/lib/services";
import { formatCents } from "@/lib/servicesCore";

interface Props {
  open: boolean;
  ownerId: string;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onSent: () => void;
}

const TZ = "America/Sao_Paulo";
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });

/** A casa combina o horário no chat e envia aqui a proposta; o cliente recebe o cartão "Confirmar e pagar". */
export default function ProposeScheduleModal({ open, ownerId, clientId, clientName, onClose, onSent }: Props) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [check, setCheck] = useState<SlotCheck | null>(null);
  const [busyItems, setBusyItems] = useState<BusyItem[] | null>(null);
  const [showAgenda, setShowAgenda] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setServiceId("");
    setDate("");
    setTime("");
    setCheck(null);
    setShowAgenda(false);
    setBusyItems(null);
    let alive = true;
    void fetchServices(ownerId).then((r) => alive && setServices(r.filter((s) => s.active)));
    return () => {
      alive = false;
    };
  }, [open, ownerId]);

  const iso = useMemo(() => brasiliaToIso(date, time), [date, time]);

  // Confere o horário assim que a casa o escolhe, antes de qualquer envio.
  useEffect(() => {
    setCheck(null);
    if (!serviceId || !iso) return;
    let alive = true;
    const t = setTimeout(() => void checkProposalSlot(serviceId, iso).then((r) => alive && setCheck(r)), 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [serviceId, iso]);

  const openAgenda = async () => {
    setShowAgenda((v) => !v);
    if (busyItems === null) setBusyItems(await fetchBusyItems(ownerId));
  };

  const dayItems = (busyItems ?? []).filter((b) => date && (dayOf(b.startsAt) === date || dayOf(b.endsAt) === date)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const send = async () => {
    if (!serviceId || !iso || !check?.ok) return;
    setSending(true);
    const error = await proposeSchedule(serviceId, clientId, iso);
    setSending(false);
    if (error) {
      toast.error(error);
      setCheck(await checkProposalSlot(serviceId, iso));
      return;
    }
    toast.success("Proposta enviada. O cliente recebe o botão para confirmar e pagar.");
    onSent();
    onClose();
  };

  const svc = services?.find((s) => s.id === serviceId);
  return (
    <Modal open={open} onClose={onClose} title="Propor horário" maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Depois de combinar com {clientName} pelo chat, envie o horário. Ele recebe um cartão com o botão para confirmar e pagar pela plataforma.
          A proposta vale por 24 horas e só reserva o horário quando ele pagar.
        </p>
        {services !== null && services.length === 0 && <p className="text-sm">Você não tem serviço ativo. Cadastre um serviço para propor horário.</p>}
        {services && services.length > 0 && (
          <>
            <div>
              <Label htmlFor="prop-service">Serviço</Label>
              <select id="prop-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="">Escolha o serviço</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.title} · {formatCents(s.priceCents)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="prop-date">Dia</Label>
                <Input id="prop-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="prop-time">Hora (Brasília)</Label>
                <Input id="prop-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            {check && !check.ok && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{check.message}</p>}
            {check?.ok && svc && <p className="rounded-xl bg-muted px-3 py-2 text-sm">Horário livre. O cliente verá: <strong>{svc.title}</strong> · {formatCents(svc.priceCents)} · Confirmar e pagar.</p>}
            <button type="button" className="text-sm font-semibold text-primary inline-flex items-center gap-1" aria-expanded={showAgenda} onClick={() => void openAgenda()}>
              <CalendarClock className="h-4 w-4" /> {showAgenda ? "Esconder a agenda" : "Ver a minha agenda"}
            </button>
            {showAgenda && (
              <div className="rounded-xl border border-border p-3 text-sm space-y-1">
                {busyItems === null && <p className="text-muted-foreground">Carregando…</p>}
                {busyItems !== null && !date && <p className="text-muted-foreground">Escolha o dia para ver o que já está marcado.</p>}
                {busyItems !== null && date && dayItems.length === 0 && <p className="text-muted-foreground">Nada marcado neste dia.</p>}
                {dayItems.map((b, i) => <p key={i}><strong>{hhmm(b.startsAt)}–{hhmm(b.endsAt)}</strong> {b.label}</p>)}
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={sending || !check?.ok} onClick={() => void send()}>{sending ? "Enviando…" : "Enviar proposta"}</Button>
        </div>
      </div>
    </Modal>
  );
}
