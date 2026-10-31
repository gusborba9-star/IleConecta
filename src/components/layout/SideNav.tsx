import { Link, NavLink } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Card } from "@/components/base";
import { cn } from "@/lib/utils";
import { navGroups, type NavEntry } from "./navConfig";

export default function SideNav() {
  const { currentUser, isRemoteAuth } = useApp();
  const isHouse = currentUser?.type === "commercial";
  const groups = navGroups({ isHouse, isRemoteAuth, userId: currentUser?.id });

  return (
    <div className="space-y-4">
      {groups.map((g, i) => (
        <Card key={i} className="p-3">
          {i === 0 && (
            <>
              <Link to={isHouse ? `/casa/${currentUser?.id}` : "/perfil"} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition">
                <Avatar src={currentUser?.avatar} name={currentUser?.name} size={44} ring={isHouse ? "gold" : "none"} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{currentUser?.name}</div>
                  <div className="text-xs text-muted-foreground">{isHouse ? "Minha casa" : "Cliente"}</div>
                </div>
              </Link>
              <div className="altar-divider my-3 rounded" />
            </>
          )}
          {g.title && <div className="px-3 pb-1 text-xs uppercase tracking-widest text-muted-foreground">{g.title}</div>}
          <nav className="flex flex-col gap-1">
            {g.items.map((it) => <NavItem key={it.to + it.label} {...it} />)}
          </nav>
        </Card>
      ))}
    </div>
  );
}

function NavItem({ to, icon: Icon, label, tone }: NavEntry) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground/80",
          tone === "gold" ? "text-gold-ink" : ""
        )
      }
    >
      <Icon className={cn("h-4 w-4", tone === "gold" ? "text-gold" : "")} />
      {label}
    </NavLink>
  );
}
