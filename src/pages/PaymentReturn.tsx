import { Link, useSearchParams } from "react-router-dom";
import { Button, Card } from "@/components/base";

/** Para onde o Stripe devolve o cliente depois da página de pagamento. A confirmação real chega pelo Stripe, por notificação. */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const ok = params.get("s") === "ok";
  return (
    <Card className="p-8 max-w-xl mx-auto text-center space-y-3">
      <h1 className="font-display font-bold text-2xl">{ok ? "Pagamento enviado" : "Pagamento não concluído"}</h1>
      <p className="text-sm text-muted-foreground">
        {ok
          ? "Estamos confirmando com o Stripe. No Pix isso leva alguns segundos; você recebe uma notificação assim que for confirmado."
          : "Nada foi cobrado. Se a sua vaga ainda estiver segurada, você pode voltar e pagar; senão, faça uma nova reserva."}
      </p>
      <div className="flex justify-center gap-2 pt-2">
        <Link to="/atividade"><Button>Ver minha atividade</Button></Link>
        <Link to="/"><Button variant="outline">Início</Button></Link>
      </div>
    </Card>
  );
}
