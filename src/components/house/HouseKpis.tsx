import { useEffect, useState } from "react";
import { Card } from "@/components/base";
import { fetchHouseRituals, type RealRitual } from "@/lib/rituals";
import { fetchHouseOrders, isOpenOrder, type ServiceOrder } from "@/lib/serviceOrders";
import { fetchAssistantReport, type AssistantReport } from "@/lib/houseReport";
import { formatBRL } from "@/lib/utils";

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
    <section aria-label="Resumo da casa" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Card className="p-4 !rounded-[22px]">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Pedidos pagos no mês</div>
        <div className="font-display font-bold text-2xl sm:text-3xl mt-2">{formatBRL(paidCents / 100)}</div>
        <div className="text-xs font-semibold text-forest mt-1">{paid.length} {paid.length === 1 ? "pedido" : "pedidos"}</div>
      </Card>
      <Card className="p-4 !rounded-[22px] !bg-[#FBF2DE] !border-[#AA781E]/30 dark:!bg-gold/10">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A520C] dark:text-gold">{next ? `Próximo ritual · ${new Date(next.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "Próximo ritual"}</div>
        <div className="font-display font-bold text-2xl sm:text-3xl mt-2">{next ? `${next.taken} de ${next.seatsTotal}` : "Nenhum"}</div>
        {next ? (
          <div className="mt-2 h-2 rounded-full bg-[#AA781E]/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Vagas preenchidas"><div className="h-2 rounded-full bg-[#C99A2E]" style={{ width: `${pct}%` }} /></div>
        ) : (
          <div className="text-xs text-muted-foreground mt-1">Crie um ritual para abrir vagas.</div>
        )}
      </Card>
      <Card className="p-4 !rounded-[22px] !bg-[#FBE9E1] !border-[#B33A18]/25 dark:!bg-primary/10">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#B33A18] dark:text-primary">Pedidos em aberto</div>
        <div className="font-display font-bold text-2xl sm:text-3xl mt-2">{open}</div>
        <div className="text-xs text-muted-foreground mt-1">{open === 0 ? "Nada esperando você." : "Aguardando pagamento, início ou conclusão."}</div>
      </Card>
      <Card className="p-4 !rounded-[22px] !border-0 text-white" style={{ background: "linear-gradient(135deg,#14543F,#0F3B2D)" }}>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-gold">Assistente · 30 dias</div>
        <div className="font-display font-bold text-2xl sm:text-3xl mt-2">{report ? report.clientsAttended : "—"}</div>
        <div className="text-xs text-white/70 mt-1">{report ? `${report.assistantReplies} respostas, ${report.ordersAfterChat} pedidos depois do chat` : "Sem dados ainda."}</div>
      </Card>
    </section>
  );
}
