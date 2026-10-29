import RefundModal from "@/components/refunds/RefundModal";
import { fetchMyPaidSources, fetchMyRefunds, isOpenRefund, withdrawRefund, type RefundRequest } from "@/lib/refunds";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import RitualForm from "@/components/rituals/RitualForm";
import RitualCardReal from "@/components/rituals/RitualCardReal";
import Attendees from "@/components/rituals/Attendees";
import ReserveModal from "@/components/rituals/ReserveModal";
import { useApp } from "@/contexts/AppContext";
import {
  cancelSeat, createRitual, fetchHouseRituals, fetchMyReservations, fetchMyWaitlist, fetchStreamUrl, fetchWaitlistCounts, joinWaitlist, leaveWaitlist, finishRitual, setRitualStatus, startRitual, subscribeReservations, updateRitual,
  type LifecycleResult, type MyReservation, type RealRitual,
} from "@/lib/rituals";
import type { RitualValue } from "@/lib/ritualsCore";

interface Props {
  ownerId: string;
  isOwn: boolean;
  startNew?: boolean;
  onAskAssistant?: () => void;
}

export default function RitualsTab({ ownerId, isOwn, startNew, onAskAssistant }: Props) {
  const { currentUser } = useApp();
  const nav = useNavigate();
  const [items, setItems] = useState<RealRitual[] | null>(null);
  const [mine, setMine] = useState<Record<string, MyReservation>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RealRitual | null>(null);
  const [editStream, setEditStream] = useState("");
  const [attendeesOf, setAttendeesOf] = useState<RealRitual | null>(null);
  const [reserving, setReserving] = useState<RealRitual | null>(null);
  const [refunding, setRefunding] = useState<{ kind: "reserva"; id: string; title: string } | null>(null);
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [waiting, setWaiting] = useState<Set<string>>(new Set());
  const [waitCounts, setWaitCounts] = useState<Record<string, number>>({});
  const userId = currentUser?.id;

  const load = useCallback(async () => {
    setItems(await fetchHouseRituals(ownerId));
    if (userId && !isOwn) {
      setMine(await fetchMyReservations(userId));
      setPaid(await fetchMyPaidSources());
      setRefunds(await fetchMyRefunds(userId));
      setWaiting(await fetchMyWaitlist(userId));
    }
    if (isOwn) setWaitCounts(await fetchWaitlistCounts());
  }, [ownerId, userId, isOwn]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
    // Vagas ao vivo: assinatura em tempo real + atualização periódica de segurança.
    const stop = subscribeReservations(() => void loadRef.current());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadRef.current();
    }, 15000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (startNew && isOwn) {
      setEditing(null);
      setEditStream("");
      setFormOpen(true);
    }
  }, [startNew, isOwn]);

  const openNew = () => {
    setEditing(null);
    setEditStream("");
    setFormOpen(true);
  };
  const openEdit = async (r: RealRitual) => {
    setEditStream((await fetchStreamUrl(r.id)) ?? "");
    setEditing(r);
    setFormOpen(true);
  };

  const save = async (value: RitualValue, publish: boolean) => {
    const ok = editing ? await updateRitual(editing.id, value) : await createRitual(ownerId, value, publish);
    if (ok) {
      toast.success(editing ? "Ritual atualizado." : publish ? "Ritual publicado." : "Rascunho salvo.");
      await load();
    }
    return ok;
  };

  const act = async (fn: () => Promise<boolean>, okMsg: string) => {
    if (await fn()) {
      toast.success(okMsg);
      await load();
    } else toast.error("Não foi possível concluir. Verifique se a migração dos rituais foi aplicada.");
  };

  const lifecycleAct = async (fn: () => Promise<LifecycleResult>, okMsg: (n: number) => string) => {
    const res = await fn();
    if (res.ok) {
      toast.success(okMsg(res.notified));
      await load();
    } else toast.error(res.message);
  };

  const cancelMine = async (r: RealRitual) => {
    const res = mine[r.id];
    if (!res || !window.confirm("Cancelar a sua vaga?")) return;
    const error = await cancelSeat(res.id);
    if (error) toast.error(error);
    else {
      toast.success("Vaga cancelada.");
      await load();
    }
  };

  const toggleWait = async (r: RealRitual) => {
    const joined = waiting.has(r.id);
    const error = joined ? await leaveWaitlist(r.id) : await joinWaitlist(r.id);
    if (error) return void toast.error(error);
    toast.success(joined ? "Você saiu da fila." : "Você entrou na fila. Avisamos se abrir uma vaga.");
    await load();
  };

  const withdrawMine = async (id: string) => {
    if (!window.confirm("Retirar o pedido de reembolso?")) return;
    const error = await withdrawRefund(id);
    if (error) toast.error(error);
    else {
      toast.success("Pedido retirado.");
      await load();
    }
  };

  if (items === null) return <Card className="p-8 text-center text-muted-foreground">Carregando rituais…</Card>;

  const visible = isOwn ? items : items.filter((r) => r.status === "publicado" || r.status === "encerrado");

  return (
    <div className="space-y-3">
      {isOwn && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone="muted">Vagas atualizadas ao vivo</Badge>
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo ritual</Button>
        </div>
      )}

      {visible.length === 0 && (
        <Card className="p-8 text-center">
          <div className="font-display text-xl mb-1">{isOwn ? "Crie o primeiro ritual" : "Esta casa ainda não publicou rituais"}</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {isOwn ? "Defina valor, vagas e quais dados pedir. Os participantes reservam a vaga e você acompanha tudo ao vivo." : "Você pode conversar com a casa para saber quando haverá o próximo."}
          </p>
          {isOwn && <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4" /> Novo ritual</Button>}
        </Card>
      )}

      {visible.map((r) => (
        <RitualCardReal
          key={r.id}
          ritual={r}
          isOwn={isOwn}
          mine={mine[r.id]}
          onReserve={() => setReserving(r)}
          waiting={waiting.has(r.id)}
          waitCount={waitCounts[r.id] ?? 0}
          onToggleWait={() => void toggleWait(r)}
          onCancelMine={() => void cancelMine(r)}
          refund={mine[r.id] ? refunds.find((x) => x.reservationId === mine[r.id].id) : undefined}
          canRefund={Boolean(mine[r.id]) && mine[r.id].status === "confirmada" && paid.has(mine[r.id].id) && (r.startedAt !== null || new Date(r.startsAt) <= new Date()) && !refunds.some((x) => x.reservationId === mine[r.id].id && isOpenRefund(x.status))}
          onRefund={() => setRefunding({ kind: "reserva", id: mine[r.id].id, title: r.title })}
          onWithdrawRefund={(id) => void withdrawMine(id)}
          onChat={() => nav(`/mensagens/${ownerId}`)}
          onAsk={onAskAssistant}
          onEdit={() => void openEdit(r)}
          onAttendees={() => setAttendeesOf(r)}
          onPublish={() => void act(() => setRitualStatus(r.id, "publicado"), "Ritual publicado.")}
          onUnpublish={() => void act(() => setRitualStatus(r.id, "rascunho"), "Ritual voltou para rascunho.")}
          onStart={() => {
            if (window.confirm(`Iniciar o ritual agora? As reservas serão encerradas e os ${r.taken} participantes serão avisados.`))
              void lifecycleAct(() => startRitual(r.id), (n) => `Ritual iniciado. ${n} ${n === 1 ? "participante avisado" : "participantes avisados"}.`);
          }}
          onFinish={() => {
            if (window.confirm("Concluir o ritual? Os participantes serão avisados."))
              void lifecycleAct(() => finishRitual(r.id), (n) => `Ritual concluído. ${n} ${n === 1 ? "participante avisado" : "participantes avisados"}.`);
          }}
          onCancelRitual={() => { if (window.confirm("Cancelar este ritual? Ele deixa de aparecer para os clientes.")) void act(() => setRitualStatus(r.id, "cancelado"), "Ritual cancelado."); }}
        />
      ))}

      {isOwn && <RitualForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} initialStreamUrl={editStream} onSubmit={save} />}
      {isOwn && <Attendees ritual={attendeesOf} onClose={() => setAttendeesOf(null)} />}
      <RefundModal target={refunding} onClose={() => setRefunding(null)} onDone={() => void load()} />
      <ReserveModal ritual={reserving} onClose={() => setReserving(null)} onDone={() => void load()} />
    </div>
  );
}
