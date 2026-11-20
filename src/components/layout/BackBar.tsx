import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasAppHistory, parentOf, showBack } from "@/lib/backNavCore.js";

/** "Voltar" no topo das telas internas (celular). Volta à tela anterior; se a pessoa abriu o link direto, vai para a tela "mãe" em vez de sair do app. */
export default function BackBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  if (!showBack(pathname)) return null;
  const go = () => (hasAppHistory(window.history.state) ? nav(-1) : nav(parentOf(pathname), { replace: true }));
  return (
    <button type="button" onClick={go} className="mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
    </button>
  );
}
