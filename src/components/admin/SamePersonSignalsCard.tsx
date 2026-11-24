import { useEffect, useState } from "react";
import { Card } from "@/components/base";
import { fetchSamePersonSignals, type SamePersonSignal } from "@/lib/returningAccounts";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const WHY = { aparelho: "mesmo aparelho", rede: "mesma rede", documento: "mesmo CPF/CNPJ" } as const;
const why = (s: ("aparelho" | "rede" | "documento")[]) => s.map((x) => WHY[x]).join(" e ");

/** Sinais de contas que podem ser da mesma pessoa. Só leitura: nenhum bloqueio é automático e o IP nunca aparece aqui. */
export default function SamePersonSignalsCard() {
  const [rows, setRows] = useState<SamePersonSignal[] | null>(null);
  useEffect(() => {
    void fetchSamePersonSignals().then(setRows);
  }, []);

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Contas que podem ser da mesma pessoa</h2>
      <p className="text-xs text-muted-foreground">
        Cruzamos o aparelho, a rede de acesso e o CPF/CNPJ informado ao contratar plano (o número nunca aparece aqui). Sinal forte: mesmo aparelho, mesmo CPF/CNPJ, ou mesma rede com contas criadas em até 14 dias. Sinal fraco: só a mesma rede. Uma pessoa pode ter, de forma legítima, mais de uma Casa. Rede de operadora e Wi-Fi compartilhado (como o de uma casa ou faculdade) geram falsos alarmes, por isso nada é bloqueado
        automaticamente: use como pista, junto com o histórico de pagamentos e reembolsos, e decida caso a caso.
      </p>
      {rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum sinal até agora.</p>}
      <ul className="space-y-2">
        {rows?.map((a) => (
          <li key={a.userId} className="rounded-xl border border-border p-3 space-y-1">
            <p className="text-sm font-medium">
              {a.name || "Sem nome"} <span className="text-muted-foreground font-normal">· {a.accountType} · {a.emailMasked} · desde {day(a.joinedAt)}</span>
            </p>
            <p className="text-xs">
              Sinal <strong>{a.nivel}</strong>
              {a.refundUsed ? " · já usou o reembolso de 7 dias" : ""}
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {a.others.map((o, i) => (
                <li key={i}>
                  {o.nome || "Sem nome"} ({o.tipo}, desde {day(o.desde)}): {why(o.sinais)}
                  {o.reembolsoUsado ? " · já usou o reembolso de 7 dias" : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
