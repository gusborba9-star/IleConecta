import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, ClipboardList, Home, Menu, MessageCircle, type LucideIcon } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useHouseBadges } from "@/lib/useHouseBadges";
import { cn } from "@/lib/utils";

export const OPEN_MENU_EVENT = "ic:abrir-menu";

/** Barra de baixo do celular para conta de casa: as 4 telas de todo dia + "Mais" (que abre o menu completo). Some no computador. */
export default function MobileBar() {
  const { currentUser, isRemoteAuth } = useApp();
  const { pathname } = useLocation();
  const isHouse = isRemoteAuth && currentUser?.type === "commercial";
  const badges = useHouseBadges(isHouse);
  // Dentro de uma conversa o campo de escrever ocupa o rodapé: a barra sai da frente.
  if (!isHouse || !currentUser || /^\/mensagens\/.+/.test(pathname)) return null;
  const items: { to: string; label: string; icon: LucideIcon; n?: number; end?: boolean }[] = [
    { to: "/", label: "Início", icon: Home, end: true },
    { to: "/mensagens", label: "Mensagens", icon: MessageCircle, n: badges.mensagens },
    { to: "/pedidos", label: "Pedidos", icon: ClipboardList, n: badges.pedidos },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
  ];
  return (
    <nav aria-label="Atalhos do celular" className="fixed inset-x-3 bottom-3 z-40 lg:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mobile-bar grid h-16 grid-cols-5 rounded-3xl bg-card">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => cn("relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-3xl text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]", isActive ? "text-forest dark:text-[hsl(158_58%_78%)]" : "text-muted-foreground")}
          >
            {({ isActive }) => (
              <>
                <it.icon className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
                <span className="max-w-full truncate px-0.5">{it.label}</span>
                {it.n ? <><span aria-hidden className="absolute right-[18%] top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[hsl(var(--danger))] px-1 text-[10px] font-bold text-white">{it.n > 9 ? "9+" : it.n}</span><span className="sr-only">{it.n} pendente{it.n > 1 ? "s" : ""}</span></> : null}
                {isActive && <span aria-hidden className="absolute bottom-1.5 h-[3px] w-5 rounded-full bg-gold" />}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
          className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-3xl text-[11px] font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          <Menu className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
          Mais
        </button>
      </div>
    </nav>
  );
}
