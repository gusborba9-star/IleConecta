import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useFocusRow } from "@/hooks/useFocusRow";
import Admin, { type AdminScreenId } from "@/pages/Admin";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminDocs from "@/components/admin/AdminDocs";
import AdminHouseTimelineCard from "@/components/admin/AdminHouseTimelineCard";
import AdminSupport from "@/components/support/AdminSupport";
import AdminRefunds from "@/components/refunds/AdminRefunds";
import PendingCenterCard from "@/components/admin/PendingCenterCard";
import AdminIndicatorsCard from "@/components/admin/AdminIndicatorsCard";
import AdminEquityCard from "@/components/admin/AdminEquityCard";
import PlatformHealthCard from "@/components/admin/PlatformHealthCard";
import MaintenanceCard from "@/components/admin/MaintenanceCard";
import OperatorCard from "@/components/admin/OperatorCard";
import PlanMatrixCard from "@/components/admin/PlanMatrixCard";
import HousePlansCard from "@/components/admin/HousePlansCard";
import PromoLimitsCard from "@/components/admin/PromoLimitsCard";
import VideoCard from "@/components/admin/VideoCard";
import AdminRecoveryCard from "@/components/admin/AdminRecoveryCard";
import AdminSecurityCard from "@/components/admin/AdminSecurityCard";
import StaffAuditCard from "@/components/admin/StaffAuditCard";
import ReturningAccountsCard from "@/components/admin/ReturningAccountsCard";
import SharedEmailAccountsCard from "@/components/admin/SharedEmailAccountsCard";
import SamePersonSignalsCard from "@/components/admin/SamePersonSignalsCard";
import ReportedReviewsCard from "@/components/admin/ReportedReviewsCard";
import ChatReportsCard from "@/components/admin/ChatReportsCard";
import AdminModerationCard from "@/components/admin/AdminModerationCard";
import MomentReportsCard from "@/components/admin/MomentReportsCard";
import MusicLibraryCard from "@/components/admin/MusicLibraryCard";
import AdminAnnounceCard from "@/components/admin/AdminAnnounceCard";
import AdminTaxIdCard from "@/components/admin/AdminTaxIdCard";
import FinancePanelCard from "@/components/admin/FinancePanelCard";
import BillingAdminCard from "@/components/admin/BillingAdminCard";
import PriceChangeCard from "@/components/admin/PriceChangeCard";
import FeeRulesCard from "@/components/admin/FeeRulesCard";
import PaymentLimitCard from "@/components/admin/PaymentLimitCard";
import AssistantEvalCard from "@/components/admin/AssistantEvalCard";
import { AdminSearch, BottomBar, Sidebar, Tile } from "@/components/admin/AdminNav";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { fetchAdminMetrics, type AdminMetrics } from "@/lib/platformConfig";
import { fetchPendingCenter } from "@/lib/pendingCenter";
import { ADMIN_GROUPS, adminTo, resolveNav, screensOf, visibleModules, canScreen, screenById } from "@/lib/adminNavCore.js";

// Telas que guardam rascunho e salvam configurações moram em Admin.tsx; as demais são cartões que se bastam.
const INLINE = new Set<string>(["cadastros", "cidades", "funcionalidades", "alcance", "precos", "historico"]);
const CARDS: Record<string, ReactNode> = {
  pendencias: <PendingCenterCard />, indicadores: <AdminIndicatorsCard />, equilibrio: <AdminEquityCard />, saude: <PlatformHealthCard />, emergencia: <MaintenanceCard />,
  suporte: <AdminSupport />, reembolsos: <AdminRefunds />, casas: <AdminHouseTimelineCard />, contas: <AdminUsers />,
  operador: <OperatorCard />, planos: <PlanMatrixCard />, "plano-das-casas": <HousePlansCard />, "vagas-destaque": <PromoLimitsCard />, video: <VideoCard />, recuperacao: <AdminRecoveryCard />, seguranca: <AdminSecurityCard />,
  "equipe-da-casa": <StaffAuditCard />, "contas-voltaram": <ReturningAccountsCard />, "emails-em-comum": <SharedEmailAccountsCard />, "mesma-pessoa": <SamePersonSignalsCard />,
  avaliacoes: <ReportedReviewsCard />, "denuncias-chat": <ChatReportsCard />, moderacao: <AdminModerationCard />, momentos: <MomentReportsCard />, musicas: <MusicLibraryCard />,
  avisos: <AdminAnnounceCard />, "cpf-cnpj": <AdminTaxIdCard />,
  financeiro: <FinancePanelCard />, cobranca: <BillingAdminCard />, reajuste: <PriceChangeCard />, taxas: <FeeRulesCard />, teto: <PaymentLimitCard />,
  "avaliacao-ia": <AssistantEvalCard />, docs: <AdminDocs />,
};
// Ajustes de largura para qualquer cartão caber no celular e a 200% de texto (antes ficavam num invólucro só da aba Configurações).
const FIT = "min-w-0 space-y-4 [overflow-wrap:anywhere] [&_select]:max-w-full [&_input]:min-w-0 [&_label]:min-w-0 [&_label>>select]:w-full [&_span]:min-w-0 [&_button]:h-auto [&_button]:min-h-10 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 [&_button]:text-center";
const HOME_SHORTCUTS = ["pendencias", "suporte", "financeiro", "avisos", "moderacao", "contas"];

function Stat({ label, value, warm = false }: { label: string; value: number; warm?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${warm ? "border-gold/40 bg-gold/10" : "border-border bg-card"}`}>
      <div className={`font-mono text-[10px] uppercase tracking-[0.08em] ${warm ? "text-gold" : "text-muted-foreground"}`}>{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-bold">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

/** Tela inicial: o que pede atenção, os números de hoje e um caminho direto para cada módulo (e para as telas mais usadas). */
function Home({ access }: { access: ReturnType<typeof usePlatformConfig>["access"] }) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [pend, setPend] = useState<{ total: number; overdue: number } | null>(null);
  const canNumbers = canScreen(access, screenById("cadastros"));
  const canPending = canScreen(access, screenById("pendencias"));
  useEffect(() => {
    let alive = true;
    if (canNumbers) void fetchAdminMetrics().then((m) => alive && setMetrics(m));
    if (canPending) void fetchPendingCenter().then((r) => { if (alive && typeof r !== "string") setPend({ total: r.total, overdue: r.overdue }); });
    return () => { alive = false; };
  }, [canNumbers, canPending]);
  const mods = visibleModules(access);
  const shortcuts = HOME_SHORTCUTS.map((id) => screenById(id)).filter((s) => s && canScreen(access, s));
  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })} · tempo real</div>
        <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl"><ShieldCheck className="h-6 w-6 text-primary" aria-hidden /> Painel da administração</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escolha um módulo ou busque a tela. As mudanças valem na hora e ficam no histórico.</p>
      </div>
      <AdminSearch access={access} />
      {canPending && (
        <Link to={adminTo("numeros", "pendencias")} className="pillow flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="font-semibold">Pendências da administração</span>
          <span className="text-muted-foreground">{pend === null ? "…" : pend.total === 0 ? "Nada pendente agora" : `${pend.total} no total · ${pend.overdue} vencida${pend.overdue === 1 ? "" : "s"}`}</span>
        </Link>
      )}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          <Stat label="Contas" value={metrics.users_total} />
          <Stat label="Casas" value={metrics.houses_total} />
          <Stat label="Clientes" value={metrics.clients_total} />
          <Stat label="Respostas da assistente (mês)" value={metrics.assistant_month.replies} warm />
        </div>
      )}
      {ADMIN_GROUPS.map((g) => {
        const list = mods.filter((m) => m.group === g);
        if (list.length === 0) return null;
        return (
          <section key={g} aria-label={g} className="space-y-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{g}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {list.map((m) => <Tile key={m.id} href={adminTo(m.id)} icon={m.id} title={m.label} desc={m.desc} />)}
            </div>
          </section>
        );
      })}
      {shortcuts.length > 0 && (
        <section aria-label="Telas mais usadas" className="space-y-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Mais usadas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {shortcuts.map((s) => s && <Tile key={s.id} href={adminTo(s.module, s.id)} icon={s.module} title={s.title} desc={s.desc} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/** Painel admin estilo CRM: menu lateral (computador), barra de ícones embaixo (celular), tela inicial com caminho para tudo e uma tela por assunto, sempre com Voltar. */
export default function AdminShell() {
  const { isAdmin, access } = usePlatformConfig();
  const [params] = useSearchParams();
  const nav = resolveNav(access, params.get("s"), params.get("c"));
  const headRef = useRef<HTMLDivElement>(null);
  const key = nav.kind === "screen" ? `${nav.module.id}/${nav.screen.id}` : nav.kind === "module" ? nav.module.id : nav.kind;
  const hasFocus = Boolean(params.get("foco"));

  useFocusRow(key);
  // Trocou de tela: volta ao topo e leva o foco ao título (leitor de tela), a não ser que um item específico esteja em foco (?foco=).
  useEffect(() => {
    if (hasFocus) return;
    window.scrollTo(0, 0);
    headRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [key, hasFocus]);

  if (!isAdmin) return <Admin screen="historico" />;
  const currentModule = nav.kind === "module" || nav.kind === "screen" ? nav.module.id : null;
  const back = nav.kind === "screen" && !nav.single ? adminTo(nav.module.id) : adminTo();

  return (
    <div className="admin-theme mb-24 rounded-3xl p-3 shadow-altar ring-1 ring-[hsl(160_16%_20%)] sm:p-4 lg:mb-4 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-4">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary lg:col-span-2"><span className="h-2 w-2 animate-pulse-slow rounded-full bg-primary" />Central de comando · Ilê Conecta</div>
      {nav.kind !== "none" && <Sidebar access={access} current={currentModule} />}
      <div className="min-w-0 space-y-4">
        {nav.kind === "none" && <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Sua conta está na equipe da administração, mas ainda não recebeu nenhum módulo de acesso. Peça ao dono da plataforma.</p>}
        {nav.kind === "hub" && <Home access={access} />}
        {(nav.kind === "module" || nav.kind === "screen") && (
          <div ref={headRef} className="space-y-1">
            <Link to={back} className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft className="h-4 w-4" aria-hidden /> Voltar</Link>
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{nav.kind === "module" ? "Módulo" : nav.module.label}</div>
            {/* Numa tela de assunto o título visível é o do próprio cartão; o h1 fica só para leitor de tela e para levar o foco. */}
            <h1 tabIndex={-1} className={nav.kind === "module" ? "font-display text-2xl font-bold outline-none sm:text-3xl" : "sr-only"}>{nav.kind === "module" ? nav.module.label : nav.screen.title}</h1>
            {nav.kind === "module" && <p className="text-sm text-muted-foreground">{nav.module.desc}</p>}
          </div>
        )}
        {nav.kind === "module" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {screensOf(access, nav.module.id).map((s) => <Tile key={s.id} href={adminTo(nav.module.id, s.id)} icon={nav.module.id} title={s.title} desc={s.desc} />)}
          </div>
        )}
        {nav.kind === "screen" && (
          <div className={FIT} data-screen={nav.screen.id}>
            {INLINE.has(nav.screen.id) ? <Admin screen={nav.screen.id as AdminScreenId} /> : CARDS[nav.screen.id]}
          </div>
        )}
      </div>
      {nav.kind !== "none" && <BottomBar access={access} current={currentModule} />}
    </div>
  );
}
