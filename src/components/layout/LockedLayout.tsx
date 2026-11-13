import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand/Logo";
import { Button } from "@/components/base";
import AccountLockScreen from "@/components/house/AccountLockScreen";
import { useApp } from "@/contexts/AppContext";
import { isLockedOpenPath, type AccountGate } from "@/lib/accountGateCore";
import type { PlanId } from "@/lib/pricing";

/**
 * Casa em bloqueio total ou inativa: sem menu, sem navegação. A pessoa vê só a tela única (pagar/reativar),
 * o suporte e o retorno do pagamento. Quando o pagamento é confirmado, o estado volta a "ok" e o app inteiro reaparece.
 */
export default function LockedLayout({ gate, plan, children }: { gate: AccountGate; plan: PlanId | null; children: ReactNode }) {
  const { logout } = useApp();
  const { pathname } = useLocation();
  const open = isLockedOpenPath(pathname);
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-card/80 px-4 py-3 flex items-center justify-between">
        <Brand size={32} subtitle={false} compact />
        <Button variant="ghost" size="sm" onClick={() => void logout()}><LogOut className="h-4 w-4 mr-1.5" aria-hidden />Sair</Button>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-3 md:px-6 py-4">
        {open ? (
          <>
            <Link to="/" className="inline-block mb-3 text-sm text-primary hover:underline">← Voltar para a conta</Link>
            {children}
          </>
        ) : (
          <AccountLockScreen gate={gate} plan={plan} />
        )}
      </main>
    </div>
  );
}
