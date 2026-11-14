import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/base";
import { fetchPlanRefund } from "@/lib/aiCredits";
import { RETURNING_REFUND_TEXT } from "@/lib/aiCreditsCore";

/** Aviso na página de planos: este e-mail já esteve vinculado a uma conta excluída. Texto neutro (o e-mail pode ter sido reaproveitado). */
export default function ReturningNoticeCard() {
  const [returning, setReturning] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchPlanRefund().then((p) => {
      if (!alive) return;
      setReturning(p?.returning === true);
      setBlocked(p?.refundBlocked === true);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!returning) return null;
  return (
    <Card className="p-4 border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" aria-hidden />
        <div className="space-y-1 text-sm">
          <h2 className="font-display font-bold">Conta reutilizada</h2>
          <p>Este endereço de e-mail possui histórico vinculado a uma conta encerrada anteriormente na plataforma.</p>
          {blocked && <p>{RETURNING_REFUND_TEXT}</p>}
          <p className="text-xs text-muted-foreground">Em caso de dúvida sobre as regras de contratação ou benefícios, consulte os <Link to="/termos" className="text-primary font-semibold hover:underline">Termos</Link> ou <Link to="/suporte" className="text-primary font-semibold hover:underline">fale com o suporte</Link>.</p>
        </div>
      </div>
    </Card>
  );
}
