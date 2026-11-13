import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import SideNav from "./SideNav";
import RightRail from "./RightRail";
import { useApp } from "@/contexts/AppContext";
import { touchPresence } from "@/lib/messaging";
import { fetchConsentRows } from "@/lib/consents";
import { LEGAL_VERSION, consentStatus, gateDocs, type ConsentDocKey } from "@/lib/legalCore";
import TermsGate from "@/components/legal/TermsGate";
import InstallPrompt from "./InstallPrompt";
import LockedLayout from "./LockedLayout";
import { fetchAccountGate } from "@/lib/accountGate";
import { fetchMyAssistant } from "@/lib/assistant";
import type { AccountGate } from "@/lib/accountGateCore";
import type { PlanId } from "@/lib/pricing";
import Footer from "./Footer";

export default function AppShell() {
  const { isRemoteAuth, currentUser } = useApp();
  const userId = currentUser?.id;

  // Aceite único: se o servidor não tem o aceite vigente desta conta, aparece só a tela de aceite (uma vez; de novo apenas se o texto mudar).
  // Se não for possível consultar, a pessoa não fica presa: a compra continua exigindo o aceite no servidor.
  const accountType = currentUser?.type;
  const [gate, setGate] = useState<{ required: ConsentDocKey[]; optional: ConsentDocKey[]; renewal: boolean } | null>(null);
  useEffect(() => {
    if (!isRemoteAuth || !userId) return;
    let alive = true;
    void fetchConsentRows(userId).then((rows) => {
      if (!alive || !rows) return;
      const g = gateDocs(accountType, rows, LEGAL_VERSION);
      setGate(g.required.length > 0 ? { ...g, renewal: g.required.some((d) => consentStatus(rows, d, LEGAL_VERSION).status === "old") } : null);
    });
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, userId, accountType]);

  // Estado da conta da casa: bloqueio total ou assinatura encerrada leva à tela única (LockedLayout). O servidor também trava as gravações.
  // Se não for possível consultar, a pessoa não fica presa. Confere ao entrar, ao voltar para a aba e de tempos em tempos (a cada 15 s enquanto bloqueada).
  const [lock, setLock] = useState<AccountGate | null>(null);
  const [lockPlan, setLockPlan] = useState<PlanId | null>(null);
  const locked = lock !== null;
  useEffect(() => {
    if (!isRemoteAuth || !userId) return;
    let alive = true;
    const check = async () => {
      const g = await fetchAccountGate();
      if (alive && g) setLock(g.state === "ok" ? null : g);
    };
    void check();
    const timer = window.setInterval(() => void check(), locked ? 15_000 : 300_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isRemoteAuth, userId, locked]);
  const lockRole = lock?.role;
  useEffect(() => {
    if (!userId || lockRole !== "dono") return;
    let alive = true;
    void fetchMyAssistant(userId).then((c) => alive && setLockPlan(c?.plan ?? null));
    return () => { alive = false; };
  }, [userId, lockRole]);

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

  if (lock) return <LockedLayout gate={lock} plan={lockPlan}><Outlet /></LockedLayout>;

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
          {gate ? <TermsGate required={gate.required} optional={gate.optional} renewal={gate.renewal} onDone={() => setGate(null)} /> : <Outlet />}
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
