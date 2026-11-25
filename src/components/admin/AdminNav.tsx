import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type LucideIcon, BarChart3, ChevronRight, FileText, History, Home, LifeBuoy, Megaphone, Menu, RotateCcw, Search, ShieldAlert, SlidersHorizontal, Sparkles, Users, UsersRound, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_GROUPS, ADMIN_MODULES, BAR_PRIORITY, adminTo as to, searchScreens, visibleModules, type AdminModule, type AdminScreen } from "@/lib/adminNavCore.js";
import type { AdminAccess } from "@/lib/adminAccessCore.js";

type Icon = LucideIcon;
const MODULE_ICON: Record<string, Icon> = {
  numeros: BarChart3, suporte: LifeBuoy, reembolsos: RotateCcw, usuarios: Users, plataforma: SlidersHorizontal, equipe: UsersRound,
  moderacao: ShieldAlert, comunicacao: Megaphone, dinheiro: Wallet, assistente: Sparkles, docs: FileText, historico: History,
};

/** Quadradinho do ícone do módulo (mesmo desenho dos atalhos da casa: ícone sem cor própria, com anel). */
export function IconBox({ id, className }: { id: string; className?: string }) {
  const I = MODULE_ICON[id] ?? BarChart3;
  return <span aria-hidden className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25", className)}><I className="h-5 w-5" strokeWidth={1.75} /></span>;
}

/** Busca no painel: abre DIRETO a tela escolhida (não rola nada). Só lista o que a pessoa pode abrir. */
export function AdminSearch({ access, className }: { access: AdminAccess; className?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const hits = searchScreens(access, q);
  const go = (s: AdminScreen) => { setQ(""); setActive(0); nav(to(s.module, s.id)); };
  return (
    <div className={cn("relative", className)} role="search">
      <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
          else if (e.key === "Escape") setQ("");
        }}
        placeholder="Buscar no painel (ex.: taxa, música, reembolso)"
        aria-label="Buscar uma tela do painel"
        className="h-12 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      {q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-14 z-20 rounded-2xl border border-border bg-card p-1 shadow-lg">
          {hits.length === 0 ? (
            <p role="status" className="px-3 py-3 text-sm text-muted-foreground">Nenhuma tela com esse termo.</p>
          ) : (
            <ul role="listbox" aria-label="Telas encontradas">
              {hits.map((s, i) => (
                <li key={s.id} role="option" aria-selected={i === active}>
                  <button type="button" onClick={() => go(s)} className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-muted", i === active && "bg-muted")}>
                    <IconBox id={s.module} className="h-8 w-8 rounded-lg" />
                    <span className="min-w-0"><span className="block truncate font-semibold">{s.title}</span><span className="block truncate text-xs text-muted-foreground">{ADMIN_MODULES.find((m) => m.id === s.module)?.label}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Menu lateral (computador): módulos agrupados, o atual marcado. */
export function Sidebar({ access, current }: { access: AdminAccess; current: string | null }) {
  const mods = visibleModules(access);
  return (
    <nav aria-label="Módulos do painel" className="hidden lg:block lg:sticky lg:top-20 lg:self-start rounded-2xl border border-border bg-card p-2 pillow">
      <Link to={to()} aria-current={current === null ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition", current === null ? "bg-primary/15 text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]" : "text-muted-foreground hover:bg-muted")}>
        <Home className="h-4 w-4 shrink-0" aria-hidden /> Início
      </Link>
      {ADMIN_GROUPS.map((g) => {
        const list = mods.filter((m) => m.group === g);
        if (list.length === 0) return null;
        return (
          <div key={g} className="mt-2">
            <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{g}</div>
            {list.map((m) => {
              const I = MODULE_ICON[m.id];
              return (
                <Link key={m.id} to={to(m.id)} aria-current={current === m.id ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition", current === m.id ? "bg-primary/15 text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]" : "text-muted-foreground hover:bg-muted")}>
                  <I className="h-4 w-4 shrink-0" aria-hidden /> {m.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** Barra de baixo do celular: Início + os módulos de todo dia + "Mais" (todos os módulos). Some no computador. */
export function BottomBar({ access, current }: { access: AdminAccess; current: string | null }) {
  const [open, setOpen] = useState(false);
  const mods = visibleModules(access);
  const quick = BAR_PRIORITY.map((id) => mods.find((m) => m.id === id)).filter((m): m is AdminModule => Boolean(m)).slice(0, 3);
  const cell = "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-3xl text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const item = (key: string, label: string, I: Icon, href: ReturnType<typeof to>, on: boolean) => (
    <Link key={key} to={href} aria-current={on ? "page" : undefined} className={cn(cell, on ? "text-foreground" : "text-muted-foreground")}>
      <I className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
      <span className="max-w-full truncate px-0.5">{label}</span>
      {on && <span aria-hidden className="absolute bottom-1.5 h-[3px] w-5 rounded-full bg-gold" />}
    </Link>
  );
  return (
    <>
      <nav aria-label="Atalhos do painel" className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mobile-bar grid h-16 grid-cols-5 rounded-3xl bg-card">
          {item("home", "Início", Home, to(), current === null)}
          {quick.map((m) => item(m.id, m.label.split(" ")[0], MODULE_ICON[m.id], to(m.id), current === m.id))}
          {Array.from({ length: 3 - quick.length }).map((_, i) => <span key={i} aria-hidden />)}
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cn(cell, "text-muted-foreground")}>
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden /> Mais
          </button>
        </div>
      </nav>
      {open && <MoreSheet mods={mods} current={current} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoreSheet({ mods, current, onClose }: { mods: AdminModule[]; current: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Fechar menu" tabIndex={-1} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Todos os módulos" className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 pb-8 shadow-altar">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-lg font-bold">Todos os módulos</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        {ADMIN_GROUPS.map((g) => {
          const list = mods.filter((m) => m.group === g);
          if (list.length === 0) return null;
          return (
            <div key={g} className="mb-3">
              <div className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{g}</div>
              <ul className="space-y-1">
                {list.map((m) => (
                  <li key={m.id}>
                    <Link to={to(m.id)} onClick={onClose} aria-current={current === m.id ? "page" : undefined} className={cn("flex min-h-14 items-center gap-3 rounded-2xl px-2 hover:bg-muted", current === m.id && "bg-primary/10")}>
                      <IconBox id={m.id} />
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{m.label}</span><span className="block text-xs text-muted-foreground">{m.desc}</span></span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bloco de um módulo ou de uma tela: ícone, título, uma linha do que faz e seta. Leva direto ao destino. */
export function Tile({ href, icon, title, desc, badge }: { href: ReturnType<typeof to>; icon: string; title: string; desc: string; badge?: string }) {
  return (
    <Link to={href} className="pillow group flex min-h-[76px] min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3.5 outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary">
      <IconBox id={icon} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{title}</span>{badge && <span className="shrink-0 rounded-full bg-[hsl(var(--danger))] px-2 py-0.5 text-[11px] font-bold text-white">{badge}</span>}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
