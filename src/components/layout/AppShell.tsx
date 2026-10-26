import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import SideNav from "./SideNav";
import RightRail from "./RightRail";
import { useApp } from "@/contexts/AppContext";
import { touchPresence } from "@/lib/messaging";

export default function AppShell() {
  const { isRemoteAuth, currentUser } = useApp();
  const userId = currentUser?.id;

  // Presença: avisa que a pessoa está online (a assistente da casa só atende quando a casa está offline).
  useEffect(() => {
    if (!isRemoteAuth || !userId) return;
    const beat = () => {
      if (document.visibilityState === "visible") void touchPresence();
    };
    beat();
    const timer = window.setInterval(beat, 60000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [isRemoteAuth, userId]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div role="status" className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        {isRemoteAuth
          ? "Versão em construção: sua conta, as casas, as publicações, os serviços, os rituais e as mensagens são reais; algumas telas ainda mostram exemplos. Nenhuma cobrança real é feita."
          : "Ambiente de demonstração: contas, mensagens, reservas e impulsionamentos usam dados locais neste navegador. Não há autenticação server-side, sincronização entre usuários ou cobrança real."}
      </div>
      <div className="flex-1 mx-auto w-full max-w-[1440px] px-3 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_320px] gap-6">
        <aside className="hidden lg:block sticky top-20 self-start">
          <SideNav />
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
        <aside className="hidden lg:block sticky top-20 self-start">
          <RightRail />
        </aside>
      </div>
    </div>
  );
}
