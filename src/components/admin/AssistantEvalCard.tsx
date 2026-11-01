import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Card } from "@/components/base";
import { EVAL_MODEL_OPTIONS, runAssistantEval, seconds, type EvalReport } from "@/lib/assistantEval";

/** Teste automático de conversas da Assistente: roda cenários reais com o modelo e mostra o que passou e o que falhou. */
export default function AssistantEvalCard() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState("");
  const [model, setModel] = useState<string>(EVAL_MODEL_OPTIONS[0].id);

  const run = async () => {
    setBusy(true);
    setError("");
    const r = await runAssistantEval(model);
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
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Modelo de IA do teste" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={model} disabled={busy} onChange={(e) => setModel(e.target.value)}>
          {EVAL_MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      <Button size="sm" onClick={() => void run()} disabled={busy}>{busy ? "Testando… (até 1 minuto)" : report ? "Testar de novo" : "Rodar teste"}</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {report && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{report.passed} de {report.total} cenários passaram{report.model ? ` · ${EVAL_MODEL_OPTIONS.find((m) => m.id === report.model)?.label ?? report.model}` : ""}</p>
          {report.avgMs !== undefined && report.maxMs !== undefined && (
            <p className="text-xs text-muted-foreground">
              Tempo por resposta: média {seconds(report.avgMs)}, a mais lenta {seconds(report.maxMs)}
              {report.avgPromptChars ? ` · instruções de ${report.avgPromptChars.toLocaleString("pt-BR")} caracteres em média` : ""}.
            </p>
          )}
          <ul className="space-y-2">
            {report.results.map((r) => (
              <li key={r.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {r.pass ? <CheckCircle2 className="h-4 w-4 text-forest" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="flex-1 min-w-0 break-words">{r.titulo}</span>
                  {r.ms !== undefined && <span className="text-xs font-normal text-muted-foreground shrink-0">{seconds(r.ms)}</span>}
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
