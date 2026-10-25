import { Link, NavLink } from "react-router-dom";
import { Home, Compass, Sparkles, MessageCircle, User, TrendingUp, Bookmark, Users } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Card } from "@/components/base";
import { cn } from "@/lib/utils";

export default function SideNav() {
  const { currentUser } = useApp();
  const isHouse = currentUser?.type === "commercial";

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <Link to={isHouse ? `/casa/${currentUser?.id}` : "/perfil"} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition">
          <Avatar src={currentUser?.avatar} name={currentUser?.name} size={44} ring={isHouse ? "gold" : "none"} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{currentUser?.name}</div>
            <div className="text-xs text-muted-foreground">{isHouse ? "Casa · Comercial" : "Cliente"}</div>
          </div>
        </Link>
        <div className="altar-divider my-3 rounded" />
        <nav className="flex flex-col gap-1">
          <NavItem to="/" icon={Home} label="Feed" />
          <NavItem to="/descobrir" icon={Compass} label="Descobrir Casas" />
          <NavItem to="/rituais" icon={Sparkles} label="Rituais & Trabalhos" />
          <NavItem to="/mensagens" icon={MessageCircle} label="Mensagens" />
          {isHouse ? (
            <>
              <NavItem to="/impulsionar" icon={TrendingUp} label="Impulsionar" tone="gold" />
              <NavItem to={`/casa/${currentUser?.id}`} icon={User} label="Página da Casa" />
            </>
          ) : (
            <NavItem to="/perfil" icon={User} label="Meu Perfil" />
          )}
        </nav>
      </Card>

      {isHouse && (
        <Card className="p-4 bg-gradient-to-br from-gold/20 via-transparent to-primary/10 border-gold/40">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Alcance sua comunidade</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Impulsione sua casa a nível cidade, estado ou país e alcance mais fiéis.
          </p>
          <Link to="/impulsionar" className="block mt-3 text-sm font-semibold text-primary hover:underline">
            Ver planos →
          </Link>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Atalhos
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="primary">Prosperidade</Badge>
          <Badge tone="gold">Amor</Badge>
          <Badge tone="forest">Cura</Badge>
          <Badge tone="muted">Búzios</Badge>
          <Badge tone="muted">Ogum</Badge>
          <Badge tone="muted">Oxum</Badge>
        </div>
      </Card>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, tone }: { to: string; icon: any; label: string; tone?: "gold" }) {
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
