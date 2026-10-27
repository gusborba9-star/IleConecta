import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/base";
import { fetchNotifications, markAllRead, subscribeNotifications, type AppNotification } from "@/lib/notifications";
import { cn, timeAgo } from "@/lib/utils";

/** Sino de notificações reais: aviso de início e fim de rituais, em tempo real. */
export default function NotificationBell({ userId }: { userId: string }) {
  const nav = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => setItems(await fetchNotifications()), []);

  useEffect(() => {
    void load();
    const stop = subscribeNotifications(userId, () => void load());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [userId, load]);

  const unread = items.filter((n) => !n.read).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      void markAllRead().then(() => load());
    }
  };

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label={unread ? `Notificações (${unread} novas)` : "Notificações"} aria-expanded={open} onClick={toggle} className="relative">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <>
          <button aria-label="Fechar notificações" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] bg-card border border-border rounded-2xl shadow-altar overflow-hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-border font-semibold text-sm">Notificações</div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</div>}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false);
                    if (n.href) nav(n.href);
                  }}
                  className={cn("w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted transition", !n.read && "bg-primary/5")}
                >
                  <div className="text-sm">{n.text}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
