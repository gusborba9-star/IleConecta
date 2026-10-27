import { useId } from "react";
import { Link } from "react-router-dom";
import { CONSENT_DOCS, type ConsentDocKey } from "@/lib/legalCore";
import { findInfoPage } from "@/content/institutional";

interface Props {
  doc: ConsentDocKey;
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** Caixa de aceite nunca pré-marcada, com o texto versionado e os links dos documentos. */
export default function ConsentBox({ doc, checked, onChange }: Props) {
  const id = useId();
  const info = CONSENT_DOCS[doc];
  return (
    <div className="rounded-md border border-border p-3">
      <label htmlFor={id} className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer">
        <input id={id} type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{info.text}</span>
      </label>
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
