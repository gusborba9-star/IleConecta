import { Link } from "react-router-dom";
import { BRAND } from "@/content/institutional";
import { useApp } from "@/contexts/AppContext";

/** Rodapé discreto em todas as telas: um link para os termos e normas (a página completa fica no menu) e o suporte. */
export default function Footer({ className = "" }: { className?: string }) {
  const { currentUser } = useApp();
  return (
    <footer className={`border-t border-border bg-card/60 ${className}`}>
      <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} {BRAND} · Rede das Casas Espirituais. Respeite todas as tradições.</p>
        <nav aria-label="Informações legais" className="flex gap-x-4">
          <Link to={currentUser ? "/termos" : "/sobre/termos-do-cliente"} className="hover:text-foreground hover:underline">Termos e normas</Link>
          <Link to="/suporte" className="hover:text-foreground hover:underline">Suporte</Link>
        </nav>
      </div>
    </footer>
  );
}
