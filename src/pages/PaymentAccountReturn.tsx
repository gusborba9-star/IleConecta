import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card } from "@/components/base";
import { fetchAccountStatus, startOnboarding } from "@/lib/payments";

/** Volta do cadastro de recebimento no Stripe: confere a situação da conta. */
export default function PaymentAccountReturn() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "ready" | "pending" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (params.get("s") === "refresh") {
      void startOnboarding().then((e) => {
        if (e) {
          setMsg(e);
          setState("error");
        }
      });
      return;
    }
    void fetchAccountStatus().then((s) => {
      if (typeof s === "string") {
        setMsg(s);
        setState("error");
      } else setState(s.chargesEnabled ? "ready" : "pending");
    });
  }, [params]);

  return (
    <Card className="p-8 max-w-xl mx-auto text-center space-y-3" role="status">
      <h1 className="font-display font-bold text-2xl">
        {state === "loading" ? "Conferindo seu cadastro…" : state === "ready" ? "Recebimento ativo" : state === "pending" ? "Cadastro em análise" : "Algo não saiu como esperado"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {state === "ready" && "Pronto: você já pode vender rituais e serviços pela plataforma."}
        {state === "pending" && "O Stripe ainda está analisando ou precisa de mais dados. Volte à página inicial para continuar o cadastro quando quiser."}
        {state === "error" && msg}
      </p>
      <Link to="/"><Button>Ir para o início</Button></Link>
    </Card>
  );
}
