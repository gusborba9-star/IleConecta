import { useConfirm } from "@/components/base/Confirm";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ORDER_LABEL, canCancelOrder, cancelOrder, fetchMyOrders, subscribeOrders, type ServiceOrder } from "@/lib/serviceOrders";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { goToCheckout, settleRefunds } from "@/lib/payments";
import { formatBRL, timeAgo } from "@/lib/utils";
import { HandHeart } from "lucide-react";
import OrderVideo from "@/components/services/OrderVideo";
import { fetchOrderMeetings, type OrderMeeting } from "@/lib/video";

export default function Activity({ embedded = false }: { embedded?: boolean }) {
  const confirm = useConfirm();
  const { currentUser } = useApp();
  const nav = useNavigate();
  const [orders, setOrders] = useState<(ServiceOrder & { houseName: string; houseOwnerId: string | null })[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [orderVideo, setOrderVideo] = useState<Map<string, OrderMeeting[]>>(new Map());
  const uid = currentUser?.id;
  const reload = useCallback(async () => {
    if (uid) { setOrders(await fetchMyOrders(uid)); setLoaded(true); }
  }, [uid]);

  const cancel = async (id: string) => {
    if (!(await confirm({ title: "Cancelar o seu pedido?", message: "Se já foi pago, o valor é devolvido integralmente.", confirmLabel: "Cancelar pedido", danger: true }))) return;
    setBusy(id);
    const error = await cancelOrder(id);
    setBusy(null);
    if (error) toast.error(error);
    else toast.success("Pedido cancelado.");
    await reload();
  };

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const load = () => void fetchMyOrders(uid).then((o) => { if (alive) { setOrders(o); setLoaded(true); } });
    load();
    // Conclui no Stripe qualquer reembolso integral que tenha ficado pendente (cancelamento, vaga cheia, ritual cancelado…).
    void settleRefunds().then((n) => alive && n > 0 && load());
    const off = subscribeOrders(load);
    return () => {
      alive = false;
      off();
    };
  }, [uid]);
  const activeKey = orders.filter((o) => o.status === "confirmado" || o.status === "em_andamento").map((o) => o.id).join(",");
  useEffect(() => {
    if (!activeKey) return;
    let alive = true;
    void fetchOrderMeetings(activeKey.split(",")).then((m) => alive && setOrderVideo(m));
    return () => { alive = false; };
  }, [activeKey]);
  if (!currentUser) return null;

  return (
    <div className={embedded ? "space-y-4" : "space-y-4 pb-16 lg:pb-4"}>
      {!embedded && (
        <Card className="page-hero p-6">
          <h1 className="font-display font-bold text-2xl">Minha atividade</h1>
          <p className="text-sm text-muted-foreground mt-1">Tudo o que você fez na plataforma, em um só lugar.</p>
        </Card>
      )}

      {orders.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <HandHeart className="h-5 w-5 text-primary" />
            <h2 className="font-display font-bold text-lg">Meus pedidos</h2>
          </div>
          <div className="divide-y divide-border">
            {orders.map((o) => (
              <div key={o.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  {o.houseOwnerId ? (
                    <Link to={`/casa/${o.houseOwnerId}`} className="font-semibold truncate block hover:underline">{o.title}</Link>
                  ) : (
                    <div className="font-semibold truncate">{o.title}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{o.houseName} · {ORDER_LABEL[o.status]} · {timeAgo(o.createdAt)}</div>
                  {o.status === "reembolsado" && <div className="text-xs text-forest mt-0.5">Valor devolvido integralmente.</div>}
                  {(o.status === "confirmado" || o.status === "em_andamento") && <OrderVideo orderId={o.id} meetings={orderVideo.get(o.id) ?? []} />}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {o.houseOwnerId && <Button size="sm" variant="outline" onClick={() => nav(`/casa/${o.houseOwnerId}`)}>Ver na casa</Button>}
                    {o.status === "aguardando_pagamento" && (
                      <Button size="sm" disabled={busy === o.id} onClick={() => void goToCheckout({ orderId: o.id }).then((e) => e && toast.error(e))}>Concluir pagamento</Button>
                    )}
                    {canCancelOrder(o.status) && (
                      <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => void cancel(o.id)}>
                        {busy === o.id ? "Cancelando…" : "Cancelar pedido"}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="font-display font-bold">{formatBRL(o.priceCents / 100)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loaded && orders.length === 0 && (
        <Card className="p-6 text-center">
          <HandHeart className="mx-auto h-8 w-8 text-gold-ink" aria-hidden />
          <h2 className="mt-2 font-display font-bold text-lg">Nada por aqui ainda</h2>
          <p className="mt-1 text-sm text-muted-foreground">Os serviços e rituais que você pedir aparecem aqui, com o andamento de cada um.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link to="/descobrir"><Button size="sm" variant="outline">Conhecer as casas</Button></Link>
            <Link to="/rituais"><Button size="sm" variant="outline">Ver os rituais</Button></Link>
          </div>
        </Card>
      )}
    </div>
  );
}
