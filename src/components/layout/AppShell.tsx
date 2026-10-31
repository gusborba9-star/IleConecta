import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import SideNav from "./SideNav";
import RightRail from "./RightRail";
import { useApp } from "@/contexts/AppContext";
import { touchPresence } from "@/lib/messaging";
import { recordConsents } from "@/lib/consents";
import { takePendingConsent } from "@/lib/pendingConsent";
import InstallPrompt from "./InstallPrompt";
import Footer from "./Footer";

export default function AppShell() {
  const { isRemoteAuth, currentUser } = useApp();
  const userId = currentUser?.id;

  // Aceite dado no cadastro: grava na primeira entrada (o aceite vale uma vez, não é pedido de novo no primeiro pagamento).
  const email = currentUser?.email;
  useEffect(() => {
    if (!isRemoteAuth || !userId) return;
    const doc = takePendingConsent(email);
    if (doc) void recordConsents([doc]);
  }, [isRemoteAuth, userId, email]);

  // Presença: avisa que a pessoa está online (a assistente da casa só atende quando a casa está offline).
  useEffect(() => {
    if (!isRemoteAuth || !userId) return;
    // A casa só conta como online por 35 s depois do último aviso (ver migração 0047), por isso o aviso sai a cada 15 s.
    // "Entregue" (✓✓) é marcado a cada 4º aviso, para não dobrar as chamadas.
    let n = 0;
    const beat = () => {
      if (document.visibilityState === "visible") void touchPresence(n++ % 4 === 0);
    };
    beat();
    const timer = window.setInterval(beat, 15000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [isRemoteAuth, userId]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      {!isRemoteAuth && (
        <div role="status" className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          Ambiente de demonstração: contas, mensagens, reservas e impulsionamentos usam dados locais neste navegador. Não há autenticação server-side, sincronização entre usuários ou cobrança real.
        </div>
      )}
      <div className={`flex-1 mx-auto w-full max-w-[1440px] px-3 md:px-6 py-4 grid grid-cols-1 gap-6 ${isRemoteAuth ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)_320px]"}`}>
        <aside className="hidden lg:block sticky top-20 self-start">
          <SideNav />
        </aside>
        <main className="min-w-0">
          {isRemoteAuth && <div className="mb-4 empty:hidden"><InstallPrompt /></div>}
          <Outlet />
        </main>
        {!isRemoteAuth && (
          <aside className="hidden lg:block sticky top-20 self-start">
            <RightRail />
          </aside>
        )}
      </div>
      <Footer />
    </div>
  );
}
