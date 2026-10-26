import { Link, NavLink } from "react-router-dom";
import { Newspaper, Home, Compass, Sparkles, MessageCircle, User, TrendingUp, Star, Crown, History, Settings, LifeBuoy } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Card } from "@/components/base";
import { INFO_PAGES } from "@/content/institutional";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export default function SideNav() {
  const { currentUser, isRemoteAuth } = useApp();
  const isHouse = currentUser?.type === "commercial";

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <Link to={isHouse ? `/casa/${currentUser?.id}` : "/perfil"} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition">
          <Avatar src={currentUser?.avatar} name={currentUser?.name} size={44} ring={isHouse ? "gold" : "none"} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{currentUser?.name}</div>
            <div className="text-xs text-muted-foreground">{isHouse ? "Minha casa" : "Cliente"}</div>
          </div>
        </Link>
        <div className="altar-divider my-3 rounded" />
        <nav className="flex flex-col gap-1">
          <NavItem to="/" icon={Home} label="Início" />
          {isHouse && isRemoteAuth && <NavItem to="/comunidade" icon={Newspaper} label="Comunidade" />}
          <NavItem to="/descobrir" icon={Compass} label="Casas" />
          <NavItem to="/rituais" icon={Sparkles} label="Rituais & Trabalhos" />
          <NavItem to="/mensagens" icon={MessageCircle} label="Mensagens" />
          {isHouse ? (
            <>
              <NavItem to={`/casa/${currentUser?.id}`} icon={User} label="Minha página" />
              <NavItem to="/perfil" icon={Settings} label="Perfil e assistente" />
            </>
          ) : (
            <>
              <NavItem to="/atividade" icon={History} label="Minha atividade" />
              <NavItem to="/perfil" icon={User} label="Meu perfil" />
            </>
          )}
        </nav>
      </Card>

      {isHouse && (
        <Card className="p-3">
          <div className="px-3 pb-1 text-xs uppercase tracking-widest text-muted-foreground">Crescer</div>
          <nav className="flex flex-col gap-1">
            <NavItem to="/planos" icon={Crown} label="Planos e upgrade" tone="gold" />
            <NavItem to="/impulsionar" icon={TrendingUp} label="Impulsionar" tone="gold" />
            <NavItem to="/destaques" icon={Star} label="Destaques nos feeds" tone="gold" />
          </nav>
        </Card>
      )}

      <Card className="p-3">
        <nav className="flex flex-col gap-0.5">
          <NavItem to="/suporte" icon={LifeBuoy} label="Suporte" />
          {INFO_PAGES.map((p) => (
            <NavLink
              key={p.slug}
              to={`/sobre/${p.slug}`}
              className={({ isActive }) => cn("px-3 py-1.5 rounded-lg text-xs transition", isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground")}
            >
              {p.title}
            </NavLink>
          ))}
        </nav>
      </Card>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, tone }: { to: string; icon: LucideIcon; label: string; tone?: "gold" }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground/80",
          tone === "gold" ? "text-[hsl(30,60%,25%)]" : ""
        )
      }
    >
      <Icon className={cn("h-4 w-4", tone === "gold" ? "text-gold" : "")} />
      {label}
    </NavLink>
  );
}
