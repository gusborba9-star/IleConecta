import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router-dom";
import { LogOut, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/base";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./navConfig";

interface Props {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  groups: NavGroup[];
  isAdmin: boolean;
  user: { id: string; name?: string; avatar?: string; isHouse: boolean } | null;
}

/** Menu "Mais" do celular: sobe de baixo, mostra os mesmos grupos da lateral e fecha ao tocar fora. Fica em portal para não ser cortado pelo cabeçalho. */
export default function MoreSheet({ open, onClose, onLogout, groups, isAdmin, user }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden" data-menu-keep>
      <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card shadow-altar animate-fade-in pb-6">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border" aria-hidden />
        {user && (
          <Link to={user.isHouse ? `/casa/${user.id}` : "/perfil"} onClick={onClose} className="mx-3 mt-3 flex items-center gap-3 rounded-2xl p-3 hover:bg-muted">
            <Avatar src={user.avatar} name={user.name} size={48} ring={user.isHouse ? "gold" : "none"} />
            <div className="min-w-0">
              <div className="font-semibold truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.isHouse ? "Casa · ver minha página" : "Cliente · ver meu perfil"}</div>
            </div>
          </Link>
        )}
        {groups.map((g, i) => (
          <div key={i} className="mt-3 px-3">
            {g.title && <div className="px-3 pb-1 text-xs uppercase tracking-widest text-muted-foreground">{g.title}</div>}
            <nav className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
              {g.items.map((it) => (
                <NavLink
                  key={it.to + it.label}
                  to={it.to}
                  end={it.to === "/"}
                  onClick={onClose}
                  className={({ isActive }) => cn("flex items-center gap-3 px-4 min-h-12 text-sm font-medium", isActive ? "bg-primary/10 text-primary" : "hover:bg-muted", it.tone === "gold" ? "text-[hsl(30,60%,25%)]" : "")}
                >
                  <it.icon className={cn("h-5 w-5", it.tone === "gold" ? "text-gold" : "")} />
                  {it.label}
                </NavLink>
              ))}
              {i === groups.length - 1 && isAdmin && (
                <NavLink to="/admin" onClick={onClose} className="flex items-center gap-3 px-4 min-h-12 text-sm font-medium hover:bg-muted">
                  <ShieldCheck className="h-5 w-5" /> Painel administrativo
                </NavLink>
              )}
            </nav>
          </div>
        ))}
        <div className="mt-3 px-3">
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 min-h-12 text-sm font-medium text-[hsl(var(--danger))] hover:bg-muted">
            <LogOut className="h-5 w-5" /> Sair
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
