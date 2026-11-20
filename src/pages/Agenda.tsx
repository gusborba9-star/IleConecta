import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";
import AgendaManager from "@/components/services/AgendaManager";
import CalendarTab from "@/components/calendar/CalendarTab";
import TabBar from "@/components/panel/TabBar";
import { tabPanelProps } from "@/components/panel/tabPanelProps";
import { fetchHouseCalendar, type CalendarItem } from "@/lib/calendar";
import { fetchHouseOrders, isOpenOrder, type ServiceOrder } from "@/lib/serviceOrders";
import { formatSlot } from "@/lib/agendaCore";

type Aba = "atendimento" | "datas";

/** Atendimentos já marcados (pedidos abertos com horário escolhido), do mais próximo ao mais distante. */
function Upcoming({ ownerId }: { ownerId: string }) {
  const [orders, setOrders] = useState<ServiceOrder[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchHouseOrders(ownerId).then((o) => alive && setOrders(o)).catch(() => alive && setOrders([]));
    return () => { alive = false; };
  }, [ownerId]);
  const now = Date.now();
  const list = (orders ?? []).filter((o) => o.scheduledAt && isOpenOrder(o.status) && new Date(o.scheduledAt).getTime() >= now).sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt))).slice(0, 8);
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-display text-lg font-bold">Próximos atendimentos marcados</h2>
      {orders === null ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : list.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum horário marcado por enquanto. Quando alguém agendar, aparece aqui.</p>
        : (
          <ul className="divide-y divide-border">
            {list.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0 break-words"><strong>{formatSlot(o.scheduledAt as string)}</strong> · {o.title}</span>
                <span className="min-w-0 break-words text-muted-foreground">{o.clientName ?? "Cliente"}</span>
              </li>
            ))}
          </ul>
        )}
      <Link to="/pedidos" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">Ver todos os pedidos →</Link>
    </Card>
  );
}

/** Agenda da casa, numa tela só: horários de atendimento (a assistente e o checkout usam esta mesma agenda) e as datas e eventos do ano. */
export default function Agenda() {
  const { currentUser, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const [params, setParams] = useSearchParams();
  const ownerId = currentUser?.type === "commercial" ? currentUser.id : "";
  const calendarOn = Boolean(ownerId) && isFeatureOn(config, "calendar", ownerId);
  const aba: Aba = params.get("aba") === "datas" && calendarOn ? "datas" : "atendimento";
  const [items, setItems] = useState<CalendarItem[]>([]);
  const load = useCallback(() => {
    if (!calendarOn || !ownerId) return setItems([]);
    void fetchHouseCalendar(ownerId).then((c) => setItems(c.enabled ? c.items : []));
  }, [calendarOn, ownerId]);
  useEffect(() => { load(); }, [load]);
  if (!ownerId || !isRemoteAuth) return <Navigate to="/" replace />;
  const tabs = [{ id: "atendimento", label: "Atendimento" }, ...(calendarOn ? [{ id: "datas", label: "Datas e eventos" }] : [])];
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-5">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Painel da casa</div>
        <h1 className="mt-1 break-words font-display text-2xl font-bold">Agenda</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seus horários de atendimento, o que já foi marcado e as datas importantes da casa. A assistente e o pagamento usam estes mesmos horários.</p>
      </Card>
      {tabs.length > 1 && <TabBar idBase="agenda" label="Agenda" value={aba} onChange={(id) => setParams(id === "atendimento" ? {} : { aba: id }, { replace: true })} tabs={tabs} />}
      {tabs.map((t) => (
        <div key={t.id} {...tabPanelProps("agenda", t.id, aba)} className="space-y-4 outline-none">
          {t.id === aba && (t.id === "atendimento" ? <><AgendaManager ownerId={ownerId} /><Upcoming ownerId={ownerId} /></> : <CalendarTab items={items} isOwn onChanged={load} />)}
        </div>
      ))}
    </div>
  );
}
