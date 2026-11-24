import { useEffect, useState } from "react";
import { Card } from "@/components/base";
import { fetchSharedEmailAccounts, type SharedEmailAccount } from "@/lib/returningAccounts";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

/** Contas ativas que compartilham um e-mail (atual ou anterior) com outra conta. Só leitura: o reembolso de 7 dias já é negado pelo servidor quando a outra conta o usou. */
export default function SharedEmailAccountsCard() {
  const [rows, setRows] = useState<SharedEmailAccount[] | null>(null);
  useEffect(() => {
    void fetchSharedEmailAccounts().then(setRows);
  }, []);

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Contas com e-mail em comum</h2>
      <p className="text-xs text-muted-foreground">
        Quem trocou de e-mail continua ligado ao e-mail antigo por 5 anos. Se uma conta nova usa um e-mail que já esteve em outra conta, as duas aparecem aqui. Nada é bloqueado: só o reembolso de 7 dias do plano não é concedido de novo quando a outra conta já o usou. O e-mail pode ter sido reaproveitado por outra pessoa, então confira cada caso.
      </p>
      {rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta com e-mail em comum até agora.</p>}
      <ul className="space-y-2">
        {rows?.map((a) => (
          <li key={a.userId} className="rounded-xl border border-border p-3 space-y-1">
            <p className="text-sm font-medium">
              {a.name || "Sem nome"} <span className="text-muted-foreground font-normal">· {a.accountType} · {a.emailMasked} · desde {day(a.joinedAt)}</span>
            </p>
            {a.refundUsed && <p className="text-xs text-muted-foreground">Esta conta já usou o reembolso de 7 dias.</p>}
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {a.others.map((o, i) => (
                <li key={i}>
                  Também ligado a: {o.nome} ({o.situacao}, desde {day(o.desde)}){o.reembolsoUsado ? " · já usou o reembolso de 7 dias" : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
