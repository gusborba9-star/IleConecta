import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";
import { fetchAssistantReport, type AssistantReport } from "@/lib/houseReport";
import { formatBRL } from "@/lib/utils";

const Stat = ({ value, label }: { value: string | number; label: string }) => (
  <div className="rounded-xl bg-muted/50 p-3 pillow">
    <div className="text-2xl font-display font-bold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

/** Desempenho da assistente nos últimos 7 dias. Só números reais; o convite ao upgrade só aparece quando houve contato de verdade. */
export default function AssistantReportCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const uid = currentUser?.id;
  const [r, setR] = useState<AssistantReport | null>(null);

  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    let alive = true;
    void fetchAssistantReport(7).then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid]);

  if (!isRemoteAuth || !uid || !r || !isFeatureOn(config, "assistant", uid)) return null;

  const withAssistant = r.plan !== "base";
  const plans = config.pricing.plans;
  const upgradeName = r.plan === "base" ? plans.intermediario.name : plans.maximo.name;
  const night = r.nightContacts24h;
  const max = Math.max(1, ...r.repliesByHour);

  // Convite ao upgrade: apenas com contatos reais; no plano máximo não há o que oferecer.
  let upsell: string | null = null;
  if (r.plan === "base" && night > 0) {
    upsell = `Ontem à noite ${night} ${night === 1 ? "cliente entrou" : "clientes entraram"} em contato com a casa. Com o plano ${upgradeName}, a assistente atende, explica e orienta enquanto você descansa.`;
  } else if (r.plan === "base" && r.contacts24h > 0) {
    upsell = `Nas últimas 24 horas ${r.contacts24h} ${r.contacts24h === 1 ? "cliente falou" : "clientes falaram"} com a casa. Com o plano ${upgradeName}, a assistente responde por você quando estiver offline.`;
  } else if (r.plan === "intermediario" && r.nightContacts > 0 && r.ordersAfterChat + r.seatsAfterChat > 0) {
    upsell = `Nos últimos ${r.days} dias, ${r.ordersAfterChat + r.seatsAfterChat} pedidos ou vagas vieram de clientes que conversaram com a assistente. No plano ${upgradeName} ela atende até 3.000 respostas por mês e pode oferecer descontos dentro do limite que você definir.`;
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h2 className="font-display font-bold text-lg">Desempenho da assistente</h2></div>

      {withAssistant ? (
        <>
          <p className="text-xs text-muted-foreground">Últimos {r.days} dias. Pedidos e vagas contam clientes que conversaram com a assistente até 7 dias antes de comprar; não é garantia de que a assistente fechou a venda.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat value={r.assistantReplies} label="respostas da assistente" />
            <Stat value={r.clientsAttended} label="clientes atendidos" />
            <Stat value={r.handoffs} label="passados para você" />
            <Stat value={r.nightContacts} label="contatos à noite (22h–7h)" />
            <Stat value={r.ordersAfterChat} label={`pedidos após conversar${r.ordersAfterChatCents > 0 ? ` · ${formatBRL(r.ordersAfterChatCents / 100)}` : ""}`} />
            <Stat value={r.seatsAfterChat} label="vagas em rituais após conversar" />
          </div>
          {r.assistantReplies > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1">Respostas por horário</div>
              <div className="flex items-end gap-0.5 h-16" role="img" aria-label="Respostas da assistente por hora do dia">
                {r.repliesByHour.map((v, h) => (
                  <div key={h} title={`${h}h: ${v}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(v > 0 ? 6 : 2, (v / max) * 100)}%`, opacity: v > 0 ? 1 : 0.2 }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
            </div>
          )}
          {r.assistantReplies === 0 && <p className="text-sm text-muted-foreground">Ainda não houve atendimentos da assistente neste período.</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">O plano {plans.base.name} não inclui a assistente. Os clientes continuam podendo falar com a casa pelo chat.</p>
      )}

      {upsell && (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
          {upsell} <span className="font-semibold">Fale com a Ilê Conecta para fazer o upgrade.</span>
        </div>
      )}
    </Card>
  );
}
