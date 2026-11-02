import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card } from "@/components/base";
import { syncPayment } from "@/lib/payments";
import { AFTER_PAYMENT } from "@/lib/cardsCore";

/** Para onde o Stripe devolve o cliente depois da página de pagamento. Confere o resultado direto no Stripe. */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const ok = params.get("s") === "ok";
  const paymentId = params.get("p");
  const isDue = params.get("k") === "m";
  const [state, setState] = useState<"checking" | "confirmed" | "waiting">(ok && paymentId ? "checking" : "waiting");

  useEffect(() => {
    if (!ok || !paymentId) return;
    let alive = true;
    let tries = 0;
    const run = async () => {
      const r = await syncPayment(paymentId);
      if (!alive) return;
      if (typeof r !== "string" && (r.status === "confirmado" || r.status === "pago")) return setState("confirmed");
      tries += 1;
      if (tries < 4) window.setTimeout(() => void run(), 3000);
      else setState("waiting");
    };
    void run();
    return () => {
      alive = false;
    };
  }, [ok, paymentId]);

  const title = !ok ? "Pagamento não concluído" : state === "confirmed" ? "Pagamento confirmado" : state === "checking" ? "Confirmando o pagamento…" : "Pagamento enviado";
  const text = !ok
    ? isDue
      ? "Nada foi cobrado. A mensalidade continua em aberto e você pode pagar quando quiser."
      : "Nada foi cobrado. Se a sua vaga ainda estiver segurada, você pode voltar e pagar; senão, faça uma nova reserva."
    : state === "confirmed"
      ? isDue
        ? "Tudo certo! A casa já foi avisada e o mês aparece como pago nas suas mensalidades."
        : "Tudo certo! A casa já foi avisada. Você pode acompanhar na sua atividade."
      : state === "checking"
        ? "Estamos conferindo com o Stripe. Leva alguns segundos."
        : AFTER_PAYMENT;
  return (
    <Card className="p-8 max-w-xl mx-auto text-center space-y-3" role="status">
      <h1 className="font-display font-bold text-2xl">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
      <div className="flex justify-center gap-2 pt-2">
        <Link to={isDue ? "/mensalidades" : "/atividade"}><Button>{isDue ? "Ver minhas mensalidades" : "Ver minha atividade"}</Button></Link>
        <Link to="/"><Button variant="outline">Início</Button></Link>
      </div>
    </Card>
  );
}
