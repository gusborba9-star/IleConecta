import { Link } from "react-router-dom";
import { BRAND, INFO_PAGES } from "@/content/institutional";

/** Rodapé em todas as telas (inclusive login e cadastro): links legais sempre à mão, no celular também. */
export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-border bg-card/60 ${className}`}>
      <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-5 space-y-3 text-xs text-muted-foreground">
        <nav aria-label="Informações legais e institucionais" className="flex flex-wrap gap-x-4 gap-y-1.5">
          {INFO_PAGES.map((p) => (
            <Link key={p.slug} to={`/sobre/${p.slug}`} className="hover:text-foreground hover:underline">
              {p.title}
            </Link>
          ))}
          <Link to="/suporte" className="hover:text-foreground hover:underline">Suporte</Link>
        </nav>
        <p>© {new Date().getFullYear()} {BRAND} · Rede das Casas de Religião Afro. Respeite todas as tradições.</p>
      </div>
    </footer>
  );
}
