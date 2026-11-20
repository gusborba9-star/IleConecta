import { useEffect, useState } from "react";
import { fetchOperator } from "@/lib/operator";
import { operatorSentence, OPERATOR_SLUGS } from "@/lib/operatorCore.js";

/** Quem opera a plataforma, no começo dos Termos e da Política (parecer do advogado, 20/11/2026). Não aparece no rodapé nem em telas de pagamento. */
export default function OperatorNotice({ slug }: { slug: string }) {
  const [text, setText] = useState<string | null>(null);
  const wanted = OPERATOR_SLUGS.includes(slug);
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    void fetchOperator().then((op) => { if (alive) setText(operatorSentence(op)); });
    return () => { alive = false; };
  }, [wanted]);
  if (!wanted || !text) return null;
  return <p className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed" data-testid="operator-notice">{text}</p>;
}
