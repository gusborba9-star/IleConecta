import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/base";
import { fetchPlanRefund } from "@/lib/aiCredits";

/** Aviso na página de planos: este e-mail já esteve vinculado a uma conta excluída. Texto neutro (o e-mail pode ter sido reaproveitado). */
export default function ReturningNoticeCard() {
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchPlanRefund().then((p) => alive && setReturning(p?.returning === true));
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
          <p>Este e-mail já esteve vinculado a uma conta excluída. Por isso, o reembolso de 7 dias do plano não está incluído nesta conta.</p>
          <p className="text-xs text-muted-foreground">Se você acha que isso é um engano, <Link to="/suporte" className="text-primary font-semibold hover:underline">fale com o suporte</Link>.</p>
        </div>
      </div>
    </Card>
  );
}
