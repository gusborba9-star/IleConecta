import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ClipboardList, Compass, Minimize2, Sparkles, User } from "lucide-react";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchMyOrders, subscribeOrders } from "@/lib/serviceOrders";
import { fetchMemberships, type Membership } from "@/lib/members";
import { fetchMyUpcomingReservations, type MyUpcomingReservation } from "@/lib/rituals";
import { buildClientItems, criticalItems, todayBR, type ClientItem } from "@/lib/clientHomeCore.js";
import { badgeText, readBubble, writeBubble } from "@/lib/pendingMinimizeCore.js";
import { cn } from "@/lib/utils";

// Classes literais (o Tailwind só gera o que está escrito por inteiro no código).
const TONES = {
  gold: "bg-gold/10 text-gold-ink ring-gold/50",
  forest: "bg-forest/10 text-forest ring-forest/40",
  terra: "bg-primary/10 text-primary ring-primary/40",
  noite: "bg-muted text-foreground ring-border",
} as const;

const SHORTCUTS = [
  { to: "/descobrir", label: "Casas", icon: Compass, tone: "gold" },
  { to: "/rituais", label: "Rituais", icon: Sparkles, tone: "forest" },
  { to: "/perfil?aba=atividade", label: "Pedidos", icon: ClipboardList, tone: "terra" },
  { to: "/perfil", label: "Minha conta", icon: User, tone: "noite" },
] as const;

/** Início do cliente (como o Facebook): o que está acontecendo com ele + atalhos, acima da comunidade. */
export default function ClientHome() {
  const { currentUser, isRemoteAuth } = useApp();
  const uid = currentUser?.id;
  const [items, setItems] = useState<ClientItem[]>([]);
  const [minimized, setMinimized] = useState(() => (uid ? readBubble(uid).minimized : false));
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    if (!uid || !isRemoteAuth) return;
    const [orders, memberships, reservations] = await Promise.all([
      fetchMyOrders(uid).catch(() => []),
      fetchMemberships().catch(() => [] as Membership[]),
      fetchMyUpcomingReservations(uid).catch(() => [] as MyUpcomingReservation[]),
    ]);
    setItems(buildClientItems({ orders, memberships, reservations, today: todayBR() }));
  }, [uid, isRemoteAuth]);

  useEffect(() => {
    void load();
    if (!uid || !isRemoteAuth) return;
    return subscribeOrders(() => void load());
  }, [load, uid, isRemoteAuth]);

  const set = (m: boolean) => { setMinimized(m); if (uid) writeBubble(uid, { minimized: m }); };
  const critical = criticalItems(items);

  const row = (i: ClientItem) => (
    <li key={i.id}>
      <Link to={i.to} className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-3 py-2 pillow transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", i.critical ? "bg-destructive" : "bg-gold")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm font-semibold leading-tight", i.critical && "text-destructive")}>{i.title}</span>
          <span className="block break-words text-xs text-muted-foreground">{i.detail}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );

  return (
    <div className="space-y-3">
      {items.length > 0 && minimized && (
        <section aria-label="Para você, minimizado" className="space-y-2">
          <button type="button" aria-expanded={false} onClick={() => set(false)}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-gold/40 bg-card px-4 py-2 text-left shadow-card transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ClipboardList className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 font-display font-bold">Para você<span className="sr-only">, {items.length} {items.length === 1 ? "aviso" : "avisos"}. Toque para abrir.</span></span>
            <span aria-hidden className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-destructive px-2 text-sm font-bold leading-none text-destructive-foreground">{badgeText(items.length)}</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          {critical.length > 0 && <ul aria-label="Avisos que precisam de atenção" className="space-y-2">{critical.map(row)}</ul>}
        </section>
      )}
      {items.length > 0 && !minimized && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-display font-bold text-lg">Para você</h2>
            <span aria-hidden className="grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-1.5 text-xs font-bold leading-none text-destructive-foreground">{badgeText(items.length)}</span>
            <button type="button" onClick={() => set(true)} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Minimize2 className="h-3.5 w-3.5" aria-hidden /> Minimizar</button>
          </div>
          <ul className="space-y-2">{(all ? items : items.slice(0, 3)).map(row)}</ul>
          {items.length > 3 && <button type="button" onClick={() => setAll((v) => !v)} className="min-h-11 w-full text-sm font-semibold text-primary hover:underline">{all ? "Ver menos" : `Ver todos (${items.length})`}</button>}
        </Card>
      )}

      <nav aria-label="Atalhos" className="grid grid-cols-4 gap-2">
        {SHORTCUTS.map(({ to, label, icon: Icon, tone }) => (
          <Link key={label} to={to} className="group flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-1 py-2 text-center shadow-card transition hover:shadow-altar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden className={cn("grid h-11 w-11 place-items-center rounded-full ring-2", TONES[tone])}><Icon className="h-5 w-5" /></span>
            <span className="text-[13px] font-semibold leading-tight">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
