import { Link, Outlet } from "react-router-dom";
import { LogoMark } from "@/components/brand/Logo";
import { useApp } from "@/contexts/AppContext";
import Footer from "./Footer";

/** Páginas abertas a quem ainda não entrou (Termos, Privacidade etc.): é preciso poder ler antes de criar a conta. */
export default function PublicLayout() {
  const { currentUser } = useApp();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
            <LogoMark size={32} />
            Ilê Conecta
          </Link>
          <Link to={currentUser ? "/" : "/login"} className="text-sm font-semibold text-primary hover:underline">
            {currentUser ? "Voltar ao app" : "Entrar"}
          </Link>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
