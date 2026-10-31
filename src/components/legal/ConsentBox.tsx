import { useId } from "react";
import { Link } from "react-router-dom";
import { CONSENT_DOCS, type ConsentDocKey } from "@/lib/legalCore";
import { findInfoPage } from "@/content/institutional";

interface Props {
  doc: ConsentDocKey;
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** Frase curta ao lado da caixa; o texto completo, que é o que fica registrado, abre em "Ver texto completo". */
const SHORT: Record<ConsentDocKey, string> = {
  termos_cliente: "Li e concordo com os Termos de Uso do cliente e a Política de Privacidade.",
  dados_sensiveis: "Autorizo o uso dos dados que eu informar sobre minha convicção religiosa, só para contratar e conversar com a casa.",
  termos_casa: "Li e aceito os Termos de Uso da Casa Espiritual (comissão de 15% em rituais e 4% em serviços).",
};

/** Caixa de aceite nunca pré-marcada, com o texto versionado e os links dos documentos. */
export default function ConsentBox({ doc, checked, onChange }: Props) {
  const id = useId();
  const info = CONSENT_DOCS[doc];
  return (
    <div className="rounded-md border border-border p-3">
      <label htmlFor={id} className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer">
        <input id={id} type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{SHORT[doc]}</span>
      </label>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-primary hover:underline">Ver texto completo</summary>
        <p className="mt-1 leading-relaxed">{info.text}</p>
      </details>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {info.links.map((slug) => (
          <Link key={slug} to={`/sobre/${slug}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {findInfoPage(slug)?.title ?? slug}
          </Link>
        ))}
      </div>
    </div>
  );
}
