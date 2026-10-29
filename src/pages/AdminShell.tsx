import { useSearchParams } from "react-router-dom";
import { BarChart3, History, RotateCcw, Settings, Users } from "lucide-react";
import Admin, { type AdminSection } from "@/pages/Admin";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminRefunds from "@/components/refunds/AdminRefunds";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "visao", label: "Visão geral", icon: BarChart3 },
  { id: "reembolsos", label: "Reembolsos", icon: RotateCcw },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "config", label: "Configurações", icon: Settings },
  { id: "historico", label: "Histórico", icon: History },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Painel admin estilo CRM: menu lateral no computador e abas roláveis no celular. */
export default function AdminShell() {
  const { isAdmin } = usePlatformConfig();
  const [params, setParams] = useSearchParams();
  const raw = params.get("s");
  const current: SectionId = SECTIONS.some((x) => x.id === raw) ? (raw as SectionId) : "visao";

  if (!isAdmin) return <Admin />;

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-4 pb-16 lg:pb-4">
      <nav aria-label="Seções do painel" className="mb-4 lg:mb-0 flex lg:flex-col gap-1 overflow-x-auto lg:sticky lg:top-20 lg:self-start rounded-2xl border border-border bg-card p-2">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setParams(id === "visao" ? {} : { s: id })}
            aria-current={current === id ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 min-h-11 text-sm font-semibold text-left transition",
              current === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" /> {label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        {(current === "visao" || current === "config" || current === "historico") && <Admin section={current as AdminSection} />}
        {current === "reembolsos" && <AdminRefunds />}
        {current === "usuarios" && <AdminUsers />}
      </div>
    </div>
  );
}
