import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Card } from "@/components/base";
import { runAssistantEval, type EvalReport } from "@/lib/assistantEval";

/** Teste automático de conversas da Assistente: roda cenários reais com o modelo e mostra o que passou e o que falhou. */
export default function AssistantEvalCard() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    const r = await runAssistantEval();
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setReport(r);
  };

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h3 className="font-semibold">Testar a Assistente</h3>
        <p className="text-xs text-muted-foreground">Roda conversas de exemplo com a IA de verdade (giras, rituais, serviços, preço, desconto, pagamento, crise, saúde) e confere as regras. Não grava nada e não gasta a cota de nenhuma casa.</p>
      </div>
      <Button size="sm" onClick={() => void run()} disabled={busy}>{busy ? "Testando… (até 1 minuto)" : report ? "Testar de novo" : "Rodar teste"}</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {report && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{report.passed} de {report.total} cenários passaram</p>
          <ul className="space-y-2">
            {report.results.map((r) => (
              <li key={r.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {r.pass ? <CheckCircle2 className="h-4 w-4 text-forest" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="flex-1 min-w-0 break-words">{r.titulo}</span>
                </div>
                {r.results.filter((c) => !c.ok).map((c) => <div key={c.name} className="text-xs text-destructive mt-1">✗ {c.why}</div>)}
                <details className="mt-1">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Ver resposta</summary>
                  <p className="mt-1 whitespace-pre-line break-words">{r.reply || "(sem resposta)"}</p>
                  {r.handoff && <p className="text-xs text-muted-foreground mt-1">A conversa foi passada para a casa.</p>}
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
