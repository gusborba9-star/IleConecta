import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import ServiceForm from "@/components/services/ServiceForm";
import ContractModal from "@/components/services/ContractModal";
import RefundModal from "@/components/refunds/RefundModal";
import { fetchMyPaidSources, fetchMyRefunds, isOpenRefund, REFUND_LABEL, withdrawRefund, type RefundRequest } from "@/lib/refunds";
import { createService, deleteService, fetchServices, updateService, type Service } from "@/lib/services";
import {
  ORDER_LABEL, canCancelOrder, cancelOrder, fetchHouseOrders, fetchStageProgress, finishOrder, isOpenOrder, payNextStage, remindNextStage, startOrder, subscribeOrders, type ServiceOrder,
} from "@/lib/serviceOrders";
import { useApp } from "@/contexts/AppContext";
import { goToCheckout } from "@/lib/payments";
import { stagePlan } from "@/lib/paymentsCore";
import { deliveryLabel, formatCents, kindLabel, SERVICE_KINDS, type ServiceValue } from "@/lib/servicesCore";

interface Props {
  /** Id do dono da casa (o mesmo id usado na rota /casa/:id). */
  ownerId: string;
  isOwn: boolean;
  startNew?: boolean;
  /** Quando a casa tem assistente, leva o cliente até ela. */
  onAskAssistant?: () => void;
}

export default function ServicesTab({ ownerId, isOwn, startNew, onAskAssistant }: Props) {
  const nav = useNavigate();
  const [items, setItems] = useState<Service[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [contracting, setContracting] = useState<Service | null>(null);
  const [refunding, setRefunding] = useState<{ kind: "pedido"; id: string; title: string } | null>(null);
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [stageDone, setStageDone] = useState<Map<string, number>>(new Map());
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const { currentUser } = useApp();

  const load = useCallback(async () => {
    setItems(await fetchServices(ownerId));
    const os = await fetchHouseOrders(ownerId);
    setOrders(os);
    setStageDone(await fetchStageProgress(os.filter((o) => o.stagesTotal > 1).map((o) => o.id)));
    if (!isOwn && currentUser?.id) {
      setPaid(await fetchMyPaidSources());
      setRefunds(await fetchMyRefunds(currentUser.id));
    }
  }, [ownerId, isOwn, currentUser?.id]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void load();
    // Pedidos ao vivo: assinatura em tempo real + atualização periódica de segurança.
    const stop = subscribeOrders(() => void loadRef.current());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadRef.current();
    }, 20000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [load]);

  const orderAct = async (fn: () => Promise<string | null>, okMsg: string) => {
    const error = await fn();
    if (error) toast.error(error);
    else {
      toast.success(okMsg);
      await load();
    }
  };
  const payStage = async (orderId: string) => {
    const error = await payNextStage(orderId);
    if (error) return void toast.error(error);
    const payError = await goToCheckout({ orderId });
    if (payError) toast.error(payError);
  };
  const stageOpen = (o: ServiceOrder) =>
    o.stagesTotal > 1 && ["confirmado", "em_andamento", "concluido"].includes(o.status) && (stageDone.get(o.id) ?? 0) < o.stagesTotal;
  const showMine = (o: ServiceOrder) =>
    o.clientId === currentUser?.id &&
    (["aguardando_pagamento", "em_andamento", "concluido", "reembolso_pendente", "reembolsado"].includes(o.status) || (o.status === "confirmado" && o.stagesTotal > 1));
  const myOpenOrder = (serviceId: string) => orders.find((o) => o.serviceId === serviceId && o.clientId === currentUser?.id && isOpenOrder(o.status));
  useEffect(() => {
    if (startNew && isOwn) {
      setEditing(null);
      setFormOpen(true);
    }
  }, [startNew, isOwn]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const save = async (value: ServiceValue) => {
    const ok = editing ? await updateService(editing.id, value) : Boolean(await createService(ownerId, value));
    if (ok) {
      toast.success(editing ? "Serviço atualizado." : "Serviço adicionado.");
      await load();
    }
    return ok;
  };

  const toggle = async (s: Service) => {
    if (await updateService(s.id, { active: !s.active })) await load();
    else toast.error("Não foi possível alterar.");
  };

  const remove = async (s: Service) => {
    if (!window.confirm(`Excluir “${s.title}”? Essa ação não pode ser desfeita.`)) return;
    if (await deleteService(s.id)) {
      toast.success("Serviço excluído.");
      await load();
    } else toast.error("Não foi possível excluir.");
  };

  if (items === null) return <Card className="p-8 text-center text-muted-foreground">Carregando serviços…</Card>;

  return (
    <div className="space-y-3">
      {isOwn && (
        <div className="flex justify-end">
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo serviço</Button>
        </div>
      )}

      {isOwn && orders.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display font-bold text-lg mb-3">Pedidos recebidos</h3>
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-start gap-3 justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-[200px] flex-1">
                  <div className="font-semibold">{o.title} <span className="font-normal text-muted-foreground">· {o.clientName}</span></div>
                  {o.modality && <p className="text-sm mt-1"><span className="text-muted-foreground">Modalidade: </span>{o.modality === "presencial" ? "Presencial" : "À distância"}</p>}
                  {o.note && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{o.note}</p>}
                  <div className="mt-1 flex items-center gap-2"><Badge tone={o.status === "concluido" ? "forest" : isOpenOrder(o.status) ? "primary" : "muted"}>{ORDER_LABEL[o.status]}</Badge><span className="text-xs text-muted-foreground">{formatCents(o.priceCents)}</span>{o.stagesTotal > 1 && <Badge tone="gold">Etapas pagas: {stageDone.get(o.id) ?? 0}/{o.stagesTotal}</Badge>}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stageOpen(o) && <Button size="sm" variant="outline" onClick={() => void orderAct(() => remindNextStage(o.id), "O cliente foi lembrado da próxima etapa.")}>Lembrar próxima etapa</Button>}
                  {o.status === "confirmado" && <Button size="sm" onClick={() => { if (window.confirm("Iniciar o trabalho agora? O cliente será avisado.")) void orderAct(() => startOrder(o.id), "Trabalho iniciado. O cliente foi avisado."); }}>Iniciar</Button>}
                  {o.status === "em_andamento" && <Button size="sm" onClick={() => { if (window.confirm("Concluir o trabalho? O cliente será avisado.")) void orderAct(() => finishOrder(o.id), "Trabalho concluído. O cliente foi avisado."); }}>Concluir</Button>}
                  {canCancelOrder(o.status) && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Cancelar este pedido? O cliente será avisado.")) void orderAct(() => cancelOrder(o.id), "Pedido cancelado."); }}>Cancelar</Button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!isOwn && orders.some(showMine) && (
        <Card className="p-5">
          <h3 className="font-display font-bold text-lg mb-3">Meus pedidos</h3>
          <div className="space-y-3">
            {orders.filter(showMine).map((o) => {
              const refund = refunds.find((r) => r.orderId === o.id);
              const canAsk = paid.has(o.id) && (o.status === "em_andamento" || o.status === "concluido") && !(refund && isOpenRefund(refund.status));
              return (
                <div key={o.id} className="flex flex-wrap items-start gap-3 justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-[200px] flex-1">
                    <div className="font-semibold">{o.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone={o.status === "concluido" ? "forest" : "primary"}>{ORDER_LABEL[o.status]}</Badge>
                      {refund && <Badge tone="gold">{REFUND_LABEL[refund.status]}</Badge>}
                      <span className="text-xs text-muted-foreground">{formatCents(o.priceCents)}</span>
                      {o.stagesTotal > 1 && <Badge tone="gold">Etapas pagas: {stageDone.get(o.id) ?? 0}/{o.stagesTotal}</Badge>}
                    </div>
                    {refund?.status === "recusado" && refund.decisionNote && <p className="text-xs text-muted-foreground mt-1">{refund.decisionNote}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {o.status === "aguardando_pagamento" && <Button size="sm" onClick={() => void goToCheckout({ orderId: o.id }).then((e) => e && toast.error(e))}>Concluir pagamento</Button>}
                    {stageOpen(o) && <Button size="sm" onClick={() => void payStage(o.id)}>Pagar próxima etapa</Button>}
                    {canAsk && <Button size="sm" variant="outline" onClick={() => setRefunding({ kind: "pedido", id: o.id, title: o.title })}>Relatar problema com a entrega</Button>}
                    {refund?.status === "pendente" && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Retirar o relato?")) void orderAct(() => withdrawRefund(refund.id), "Pedido retirado."); }}>Retirar relato</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {items.length === 0 && (
        <Card className="p-8 text-center">
          <div className="font-display text-xl mb-1">{isOwn ? "Cadastre o primeiro serviço" : "Esta casa ainda não cadastrou serviços"}</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {isOwn
              ? `Quem visita a sua página vê os serviços com valor e forma de atendimento: ${SERVICE_KINDS.map((k) => k.label.toLowerCase()).join(", ")}.`
              : "Você pode conversar com a casa para saber como ela atende."}
          </p>
          {isOwn && <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4" /> Novo serviço</Button>}
        </Card>
      )}

      {items.map((s) => (
        <Card key={s.id} className={`p-5 ${s.active ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[220px]">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-bold text-xl">{s.title}</h3>
                <Badge tone="gold">{kindLabel(s.kind, s.customKind)}</Badge>
                <Badge tone="muted">{deliveryLabel(s.delivery)}</Badge>
                {!s.active && <Badge tone="muted">Pausado</Badge>}
              </div>
              {s.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{s.description}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                {s.delivery === "presencial"
                  ? "Atendimento presencial: combine e pague direto com a casa."
                  : s.delivery === "hibrido"
                  ? "Presencial ou à distância: você escolhe ao contratar pela plataforma."
                  : "Contrate pela plataforma: a casa inicia e conclui o trabalho e você é avisado em cada etapa."}
              </p>
              {!isOwn && myOpenOrder(s.id) && (
                <div className="mt-2"><Badge tone="primary">Seu pedido: {ORDER_LABEL[myOpenOrder(s.id)!.status]}</Badge></div>
              )}
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-2xl">{formatCents(s.priceCents)}</div>
              {s.stages > 1 && <div className="text-xs text-muted-foreground">Em {s.stages} etapas: {stagePlan(s.priceCents, s.stages).map((v) => formatCents(v)).join(" + ")}</div>}
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {isOwn ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(s); setFormOpen(true); }}>Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.active ? "Pausar" : "Ativar"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)}>Excluir</Button>
                  </>
                ) : (
                  <>
                    {onAskAssistant && <Button size="sm" variant="outline" onClick={onAskAssistant}>Perguntar à assistente</Button>}
                    {s.active && s.delivery !== "presencial" && !myOpenOrder(s.id) && <Button size="sm" onClick={() => setContracting(s)}>Contratar</Button>}
                    {myOpenOrder(s.id) && canCancelOrder(myOpenOrder(s.id)!.status) && (
                      <Button size="sm" variant="outline" onClick={() => { if (window.confirm("Cancelar o seu pedido?")) void orderAct(() => cancelOrder(myOpenOrder(s.id)!.id), "Pedido cancelado."); }}>Cancelar pedido</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => nav(`/mensagens/${ownerId}`)}>{s.delivery === "presencial" ? "Conversar para agendar" : "Conversar com a casa"}</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}

      <RefundModal target={refunding} onClose={() => setRefunding(null)} onDone={() => void load()} />
      <ContractModal service={contracting} onClose={() => setContracting(null)} onDone={() => void load()} />
      {isOwn && <ServiceForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSubmit={save} />}
    </div>
  );
}
