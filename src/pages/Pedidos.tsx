import { useCallback, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import ServicesTab from "@/components/services/ServicesTab";
import HouseRefundCases from "@/components/refunds/HouseRefundCases";
import TabBar from "@/components/panel/TabBar";
import { tabPanelProps } from "@/components/panel/tabPanelProps";

type Aba = "andamento" | "historico";

/** Pedidos recebidos pela casa: em andamento (aberto) e histórico, o mais novo primeiro. Quem atende pela equipe usa a tela de Atendimento. */
export default function Pedidos() {
  const { currentUser, isRemoteAuth } = useApp();
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get("aba") === "historico" ? "historico" : "andamento";
  const [counts, setCounts] = useState({ andamento: 0, historico: 0 });
  const onCounts = useCallback((c: { andamento: number; historico: number }) => setCounts((o) => (o.andamento === c.andamento && o.historico === c.historico ? o : c)), []);
  if (!currentUser || currentUser.type !== "commercial" || !isRemoteAuth) return <Navigate to="/" replace />;
  const change = (id: string) => setParams(id === "andamento" ? {} : { aba: id }, { replace: true });

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-5">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Painel da casa</div>
        <h1 className="mt-1 break-words font-display text-2xl font-bold">Pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">O que as pessoas contrataram: inicie, conclua ou cancele. Os pedidos terminados ficam no histórico.</p>
      </Card>
      <HouseRefundCases ownerId={currentUser.id} />
      <TabBar
        idBase="pedidos"
        label="Pedidos"
        value={aba}
        onChange={change}
        tabs={[{ id: "andamento", label: "Em andamento", badge: counts.andamento }, { id: "historico", label: "Histórico" }]}
      />
      {(["andamento", "historico"] as Aba[]).map((id) => (
        <div key={id} {...tabPanelProps("pedidos", id, aba)} className="space-y-3 outline-none">
          {id === aba && <ServicesTab ownerId={currentUser.id} isOwn ordersOnly ordersView={aba} onCounts={onCounts} />}
        </div>
      ))}
    </div>
  );
}
