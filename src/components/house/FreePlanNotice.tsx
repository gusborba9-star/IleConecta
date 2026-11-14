import { Link } from "react-router-dom";
import { Card } from "@/components/base";
import { STOP_SELLING_LOSSES } from "@/lib/platformAdvantages";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";

/**
 * Aviso do plano Grátis, mostrado à casa: como a venda funciona e o que muda nos planos pagos.
 * Os números vêm da matriz de planos (painel admin). O texto jurídico definitivo fica nos Termos de Uso.
 */
export default function FreePlanNotice() {
  const { config } = usePlatformConfig();
  const c = config.plan_matrix.caps.gratis;
  const lim = (n: number) => (n > 0 ? String(n) : "ilimitados");
  return (
    <Card role="note" className="p-5 border-gold/50 bg-gold/10">
      <h2 className="font-display font-bold text-lg">Como funciona o plano Grátis</h2>
      <ul className="mt-2 list-disc pl-5 space-y-1.5 text-sm">
        <li>A plataforma já oferece todos os meios de pagamento de forma interna. No plano Grátis, serviços e rituais são vendidos <strong>somente pela plataforma</strong>, e você precisa conectar a sua conta de recebimento antes de publicar algo com valor.</li>
        <li>Combinar ou receber pagamentos fora da plataforma será avaliado pela administração e pode levar à <strong>suspensão ou exclusão da conta</strong>.</li>
        <li>Quer usar outros meios de pagamento ou combinar direto com o cliente? Faça o upgrade para um plano pago.</li>
        <li>Limites do Grátis: {lim(c.limit_services)} serviços ativos, {lim(c.limit_rituals)} rituais ativos e {lim(c.limit_posts_month)} publicações por mês. Rituais coletivos são sempre vendidos pela plataforma, em qualquer plano.</li>
        <li>Você pode comprar pacotes de mensagens para ativar a assistente, e pagar para destacar ou impulsionar a casa, mesmo no Grátis.</li>
      </ul>
      <p className="text-xs text-muted-foreground mt-3">Veja as regras completas nos <Link to="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Uso</Link>.</p>
    </Card>
  );
}

/** Vantagens de vender pela plataforma, para a casa em qualquer plano (nos pagos, a venda pode ser desligada). */
export function SellOnPlatformCard({ paid }: { paid: boolean }) {
  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-lg">Por que vender pela plataforma</h2>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        {STOP_SELLING_LOSSES.map((t) => <li key={t}>{t}</li>)}
      </ul>
      {paid && <p className="text-xs text-muted-foreground mt-3">Nos planos pagos você pode desligar a venda pela plataforma em Assistente; antes de confirmar, mostramos o que deixa de valer.</p>}
    </Card>
  );
}
