import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ORDER_LABEL, canCancelOrder, cancelOrder, fetchMyOrders, subscribeOrders, type ServiceOrder } from "@/lib/serviceOrders";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { settleRefunds } from "@/lib/payments";
import { formatBRL, timeAgo } from "@/lib/utils";
import { CalendarClock, HandHeart, Ticket } from "lucide-react";

export default function Activity() {
  const { currentUser, purchases, rituals, getHouse } = useApp();
  const nav = useNavigate();
  const [orders, setOrders] = useState<(ServiceOrder & { houseName: string; houseOwnerId: string | null })[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const uid = currentUser?.id;
  const reload = useCallback(async () => {
    if (uid) setOrders(await fetchMyOrders(uid));
  }, [uid]);

  const cancel = async (id: string) => {
    if (!window.confirm("Cancelar o seu pedido? Se já foi pago, o valor é devolvido integralmente.")) return;
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
    const load = () => void fetchMyOrders(uid).then((o) => alive && setOrders(o));
    load();
    // Conclui no Stripe qualquer reembolso integral que tenha ficado pendente (cancelamento, vaga cheia, ritual cancelado…).
    void settleRefunds().then((n) => alive && n > 0 && load());
    const off = subscribeOrders(load);
    return () => {
      alive = false;
      off();
    };
  }, [uid]);
  if (!currentUser) return null;
  const mine = purchases.filter((p) => p.userId === currentUser.id).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6">
        <h1 className="font-display font-bold text-2xl">Minha atividade</h1>
        <p className="text-sm text-muted-foreground mt-1">Tudo o que você fez na plataforma, em um só lugar.</p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Consultas agendadas</h2>
        </div>
        <p className="text-sm text-muted-foreground">O agendamento de consultas ainda não está disponível. Quando estiver, elas aparecerão aqui.</p>
      </Card>

      {orders.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <HandHeart className="h-5 w-5 text-primary" />
            <h2 className="font-display font-bold text-lg">Meus serviços</h2>
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
                  <div className="mt-2 flex flex-wrap gap-2">
                    {o.houseOwnerId && <Button size="sm" variant="outline" onClick={() => nav(`/casa/${o.houseOwnerId}`)}>Ver na casa</Button>}
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

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Histórico</h2>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada por aqui ainda. <Link to="/rituais" className="text-primary font-semibold hover:underline">Conheça os rituais →</Link>
          </p>
        ) : (
          <div className="divide-y divide-border">
            {mine.map((p) => {
              const r = rituals.find((x) => x.id === p.ritualId);
              const h = r ? getHouse(r.houseId) : null;
              return (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r?.title ?? "Ritual não encontrado"}</div>
                    <div className="text-xs text-muted-foreground">{h?.name ?? "Casa não encontrada"} · {timeAgo(p.createdAt)} · registro demonstrativo</div>
                  </div>
                  <div className="font-display font-bold">{formatBRL(p.amount)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
