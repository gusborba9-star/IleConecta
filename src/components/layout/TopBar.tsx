import { Brand } from "@/components/brand/Logo";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Bell, Home, MessageCircle, Search, Sparkles, Compass, User, LogOut, LifeBuoy, ShieldCheck } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import NotificationBell from "@/components/layout/NotificationBell";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { Avatar, Button } from "@/components/base";
import { useCallback, useEffect, useRef, useState } from "react";
import MoreSheet from "@/components/layout/MoreSheet";
import { navGroups } from "@/components/layout/navConfig";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export default function TopBar() {
  const { currentUser, logout, isRemoteAuth } = useApp();
  const { isAdmin } = usePlatformConfig();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);

  // Fecha ao tocar fora ou apertar Esc (o menu antigo só fechava com o mouse, o que não funciona no celular).
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: Event) => {
      const t = e.target as Element | null;
      if (box.current?.contains(t) || t?.closest("[data-menu-keep]")) return;
      setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <header className="sticky top-0 z-40 glass border-b border-border shadow-[0_1px_0_hsl(var(--gold)/0.35)]">
      <div className="mx-auto max-w-[1440px] px-3 md:px-6 h-16 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <Brand size={38} compact />
        </Link>

        <div className="flex-1 max-w-md ml-2 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Buscar casas e rituais"
              placeholder="Buscar casas e rituais..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchQuery.trim()) {
                  nav(`/descobrir?q=${encodeURIComponent(searchQuery.trim())}`);
                }
              }}
              className="w-full h-11 pl-10 pr-4 rounded-full bg-muted border border-transparent focus:bg-background focus:border-input focus:ring-2 focus:ring-[hsl(var(--ring))] outline-none text-sm transition"
            />
          </div>
        </div>

        <nav className="flex-1 flex justify-center items-center gap-1">
          <TopIcon to="/" icon={Home} label="Início" />
          <TopIcon to="/descobrir" icon={Compass} label="Casas" />
          <TopIcon to="/rituais" icon={Sparkles} label="Rituais" />
          <TopIcon to="/mensagens" icon={MessageCircle} label="Mensagens" />
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {isRemoteAuth && currentUser ? (
            <NotificationBell userId={currentUser.id} />
          ) : (
            <Button variant="ghost" size="icon" aria-label="Notificações indisponíveis na demonstração" disabled title="Notificações ainda não estão implementadas">
              <Bell className="h-5 w-5" />
            </Button>
          )}
          <div className="relative" ref={box}>
            <button aria-label="Menu da conta" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-muted transition">
              <Avatar src={currentUser?.avatar} name={currentUser?.name} size={34} ring={currentUser?.type === "commercial" ? "gold" : "none"} />
            </button>
            {menu && (
              <div className="hidden lg:block absolute right-0 mt-2 w-64 bg-card border border-border rounded-2xl shadow-altar overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-border">
                  <div className="font-semibold">{currentUser?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {currentUser?.type === "commercial" ? "Casa · Conta Comercial" : "Cliente · Conta Pessoal"}
                  </div>
                </div>
                <div className="py-2">
                  <MenuItem onClick={() => { setMenu(false); nav(currentUser?.type === "commercial" ? `/casa/${currentUser.id}` : "/perfil"); }} icon={User} label="Meu perfil" />
                  {isAdmin && <MenuItem onClick={() => { setMenu(false); nav("/admin"); }} icon={ShieldCheck} label="Painel administrativo" />}
                  <MenuItem onClick={() => { setMenu(false); nav("/suporte"); }} icon={LifeBuoy} label="Suporte" />
                  <MenuItem onClick={() => { logout(); nav("/login"); }} icon={LogOut} label="Sair" tone="danger" />
                </div>
              </div>
            )}
            <MoreSheet
              open={menu}
              onClose={closeMenu}
              onLogout={() => { setMenu(false); logout(); nav("/login"); }}
              groups={navGroups({ isHouse: currentUser?.type === "commercial", isRemoteAuth, userId: currentUser?.id })}
              isAdmin={isAdmin}
              user={currentUser ? { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar, isHouse: currentUser.type === "commercial" } : null}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function TopIcon({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "px-3 md:px-6 h-11 rounded-full flex items-center gap-2 text-sm font-semibold transition",
          isActive ? "bg-forest/10 text-forest shadow-[inset_0_-2px_0_hsl(var(--gold))]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )
      }
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" />
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  );
}

function MenuItem({ icon: Icon, label, onClick, tone }: { icon: LucideIcon; label: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition",
        tone === "danger" ? "text-[hsl(var(--danger))]" : ""
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
