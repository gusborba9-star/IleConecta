import { useEffect, useState, type ReactNode } from "react";
import { Bot, CalendarDays, ClipboardList, Wallet, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/base";
import { fetchHouseRituals, type RealRitual } from "@/lib/rituals";
import { fetchHouseOrders, isOpenOrder, type ServiceOrder } from "@/lib/serviceOrders";
import { fetchAssistantReport, type AssistantReport } from "@/lib/houseReport";
import { cn, formatBRL } from "@/lib/utils";
import { TONE_CLASS, type ToolTone } from "@/components/panel/toneClass";

const PAID = new Set(["confirmado", "em_andamento", "concluido"]);

/** Faixa de números do painel da casa: só dados reais; some enquanto nada carregou. */
export default function HouseKpis({ ownerId }: { ownerId: string }) {
  const [orders, setOrders] = useState<ServiceOrder[] | null>(null);
  const [rituals, setRituals] = useState<RealRitual[] | null>(null);
  const [report, setReport] = useState<AssistantReport | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchHouseOrders(ownerId).then((o) => alive && setOrders(o)).catch(() => alive && setOrders([]));
    void fetchHouseRituals(ownerId).then((r) => alive && setRituals(r)).catch(() => alive && setRituals([]));
    void fetchAssistantReport(30).then((r) => alive && setReport(r)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ownerId]);

  if (orders === null && rituals === null) return null;

  const now = new Date();
  const month = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const paid = (orders ?? []).filter((o) => PAID.has(o.status) && month(o.createdAt));
  const paidCents = paid.reduce((s, o) => s + o.priceCents, 0);
  const open = (orders ?? []).filter((o) => isOpenOrder(o.status)).length;
  const next = (rituals ?? [])
    .filter((r) => new Date(r.startsAt).getTime() >= now.getTime() && r.status === "publicado")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const pct = next && next.seatsTotal > 0 ? Math.min(100, Math.round((next.taken / next.seatsTotal) * 100)) : 0;

  return (
    <section aria-label="Resumo da casa" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3 xl:grid-cols-4">
      <Kpi to="/pedidos?aba=historico" icon={Wallet} tone="ouro" label="Pago no mês" value={formatBRL(paidCents / 100)} note={`${paid.length} ${paid.length === 1 ? "pedido" : "pedidos"}`} />
      <Kpi to={`/casa/${ownerId}?aba=rituais`} icon={CalendarDays} tone="terra" label={next ? `Próximo ritual · ${new Date(next.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "Próximo ritual"} value={next ? `${next.taken} de ${next.seatsTotal}` : "Nenhum"}
        note={next ? undefined : "Crie um ritual para abrir vagas."}
        extra={next ? <div className="mt-2 h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Vagas preenchidas"><div className="h-2 rounded-full bg-[#C99A2E]" style={{ width: `${pct}%` }} /></div> : undefined} />
      <Kpi to="/pedidos" icon={ClipboardList} tone="verde" label="Pedidos em aberto" value={String(open)} note={open === 0 ? "Nada esperando você." : "Aguardando pagamento, início ou conclusão."} />
      <Kpi to="/perfil" icon={Bot} tone="noite" label="Assistente · 30 dias" value={report ? String(report.clientsAttended) : "—"} note={report ? `${report.assistantReplies} respostas, ${report.ordersAfterChat} pedidos depois do chat` : "Sem dados ainda."} />
    </section>
  );
}

/** Os quatro resumos têm o mesmo molde (anel, nome, número, nota) e a mesma altura; só o anel muda de cor. */
function Kpi({ to, icon: Icon, tone, label, value, note, extra }: { to: string; icon: LucideIcon; tone: ToolTone; label: string; value: string; note?: string; extra?: ReactNode }) {
  return (
    <Link to={to} className="block h-full rounded-[22px] outline-none transition focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] hover:-translate-y-0.5">
      <Card className="flex h-full min-h-[10.5rem] flex-col p-4 !rounded-[22px]">
        <span className={cn("tool-ring !h-10 !w-10 shrink-0", TONE_CLASS[tone])}><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden /></span>
        <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
        <div className="mt-1 break-words font-display text-2xl font-bold">{value}</div>
        {extra}
        {note && <div className="mt-auto pt-1 text-xs leading-snug text-muted-foreground">{note}</div>}
      </Card>
    </Link>
  );
}
