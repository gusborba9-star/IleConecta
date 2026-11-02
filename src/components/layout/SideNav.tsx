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
        <Card key={i} className={cn("p-3", isHouse && "!bg-[#0F3B2D] !border-white/10 !text-[#EAF1EC] shadow-altar")}>
          {i === 0 && (
            <>
              <Link to={isHouse ? `/casa/${currentUser?.id}` : "/perfil"} className={cn("flex items-center gap-3 p-2 rounded-xl transition", isHouse ? "hover:bg-white/10" : "hover:bg-muted")}>
                <Avatar src={currentUser?.avatar} name={currentUser?.name} size={44} ring={isHouse ? "gold" : "none"} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{currentUser?.name}</div>
                  <div className={cn("text-xs", isHouse ? "text-[#9FC2B2]" : "text-muted-foreground")}>{isHouse ? "Painel da casa" : "Cliente"}</div>
                </div>
              </Link>
              <div className="altar-divider my-3 rounded" />
            </>
          )}
          {g.title && <div className={cn("px-3 pb-1 text-xs uppercase tracking-widest", isHouse ? "text-[#E3BF5A]" : "text-muted-foreground")}>{g.title}</div>}
          <nav className="flex flex-col gap-1">
            {g.items.map((it) => <NavItem key={it.to + it.label} {...it} dark={isHouse} />)}
          </nav>
        </Card>
      ))}
    </div>
  );
}

function NavItem({ to, icon: Icon, label, tone, dark }: NavEntry & { dark?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
          dark
            ? isActive ? "bg-[#1B5A45] text-white font-semibold shadow-[inset_3px_0_0_#E3BF5A]" : "text-[#D5E4DB] hover:bg-white/10"
            : isActive ? "bg-forest/10 text-forest font-semibold shadow-[inset_3px_0_0_hsl(var(--gold))]" : "hover:bg-muted text-foreground/80",
          tone === "gold" ? (dark ? "text-[#F2DC95]" : "text-gold-ink") : ""
        )
      }
    >
      <Icon className={cn("h-4 w-4", tone === "gold" ? "text-gold" : "")} />
      {label}
    </NavLink>
  );
}
