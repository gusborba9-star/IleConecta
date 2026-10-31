import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { BRAND, INFO_PAGES } from "@/content/institutional";

/** Rodapé em todas as telas (inclusive login e cadastro): links legais sempre à mão, no celular também. */
export default function Footer({ className = "" }: { className?: string }) {
  const LINKS = (
    <>
      {INFO_PAGES.map((p) => (
        <Link key={p.slug} to={`/sobre/${p.slug}`} className="hover:text-foreground hover:underline">
          {p.title}
        </Link>
      ))}
      <Link to="/suporte" className="hover:text-foreground hover:underline">Suporte</Link>
    </>
  );
  return (
    <footer className={`border-t border-border bg-card/60 ${className}`}>
      <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-5 space-y-3 text-xs text-muted-foreground">
        <details className="md:hidden group">
          <summary className="cursor-pointer select-none font-semibold text-foreground list-none flex items-center justify-between">
            Normas, termos e privacidade
            <ChevronDown aria-hidden className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <nav aria-label="Informações legais e institucionais" className="mt-2 flex flex-col gap-2">
            {LINKS}
          </nav>
        </details>
        <nav aria-label="Informações legais e institucionais" className="hidden md:flex flex-wrap gap-x-4 gap-y-1.5">
          {LINKS}
        </nav>
        <p>© {new Date().getFullYear()} {BRAND} · Rede das Casas de Religião Afro. Respeite todas as tradições.</p>
      </div>
    </footer>
  );
}
