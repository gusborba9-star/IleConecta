import HousePendingCard from "@/components/house/HousePendingCard";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Bot, ClipboardList, Contact, Crown, Landmark, Leaf, Megaphone, Newspaper, Pencil, Plus, Sparkles, Star, TrendingUp, Users, UsersRound, Camera, CalendarDays } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import AssistantReportCard from "@/components/house/AssistantReportCard";
import QuietHoursCard from "@/components/house/QuietHoursCard";
import SocialNoticesCard from "@/components/house/SocialNoticesCard";
import DiscreetModeCard from "@/components/profile/DiscreetModeCard";
import ReferralCard from "@/components/house/ReferralCard";
import HouseKpis from "@/components/house/HouseKpis";
import HouseIndicatorsCard from "@/components/house/HouseIndicatorsCard";
import PromoList from "@/components/promo/PromoList";
import PlanUpsellModal from "@/components/house/PlanUpsellModal";
import ShareHouseCard from "@/components/house/ShareHouseCard";
import BillingAlertCard from "@/components/house/BillingAlertCard";
import PaymentAccountCard from "@/components/payments/PaymentAccountCard";
import ToolTile, { type ToolTone } from "@/components/panel/ToolTile";
import Collapse from "@/components/panel/Collapse";
import { useHouseBadges } from "@/lib/useHouseBadges";
import { fetchHouseTermsAccepted } from "@/lib/consents";
import { fetchMembersOverview } from "@/lib/members";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";
import { useOwnerPlan } from "@/lib/housePlan";
import { minPlanFor, type CapFlagKey, type CapNumberKey } from "@/lib/planMatrixCore";
import { FREE_PLAN_NAME, HOUSE_PLAN_IDS } from "@/lib/platformConfigCore";
import type { LucideIcon } from "lucide-react";
import type { HouseUser } from "@/types";

interface Tool {
  icon: LucideIcon;
  title: string;
  tone: ToolTone;
  to: string;
  badge?: number;
  /** Ferramenta de plano: se o plano atual não inclui, o toque abre o aviso do plano. */
  needs?: CapFlagKey | CapNumberKey;
  about?: string;
}

/**
 * Página inicial da conta de casa: o que precisa de você agora e as ferramentas, uma por atalho.
 * Cada ferramenta tem a sua tela; o que é configuração fica em seções recolhidas no fim.
 * Cores dos anéis: verde = pessoas e gestão, terracota = comunicação e eventos, ouro = receita e alcance, noite = assistente.
 */
export default function HouseHome() {
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const house = currentUser?.type === "commercial" ? (currentUser as HouseUser) : null;
  const [termsOk, setTermsOk] = useState(true);
  const [upsell, setUpsell] = useState<{ title: string; about: string; planName: string; to: string } | null>(null);
  const houseId = house?.id;
  const { config } = usePlatformConfig();
  const { plan } = useOwnerPlan(house?.id);
  const badges = useHouseBadges(isRemoteAuth && Boolean(houseId));
  const [params] = useSearchParams();
  const focusReceipt = params.get("foco") === "recebimento";

  useEffect(() => {
    if (!isRemoteAuth || !houseId) return;
    let alive = true;
    void fetchHouseTermsAccepted(houseId).then((ok) => alive && setTermsOk(ok));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, houseId]);

  if (!house) return null;
  // Link antigo da central de pendências (`/?foco=recebimento`): leva para a tela de recebimentos.
  if (focusReceipt && isRemoteAuth) return <Navigate to="/recebimentos?foco=recebimento" replace />;

  const tools: Tool[] = [
    { icon: ClipboardList, title: "Pedidos", tone: "verde", to: "/pedidos", badge: badges.pedidos },
    ...(isRemoteAuth ? [{ icon: Users, title: "Membros", tone: "verde" as const, to: "/painel/membros", badge: badges.membros, needs: "members_area" as CapFlagKey, about: "Controle mensalidades, vencimentos e avisos de cobrança dos membros da sua casa em um só lugar." }] : []),
    ...(isRemoteAuth ? [{ icon: Contact, title: "Pessoas", tone: "verde" as const, to: "/pessoas" }] : []),
    { icon: Plus, title: "Novo serviço", tone: "verde", to: `/casa/${house.id}?aba=servicos&novo=1` },
    { icon: Sparkles, title: "Novo ritual", tone: "terra", to: `/casa/${house.id}?aba=rituais&novo=1` },
    { icon: Newspaper, title: "Publicar", tone: "terra", to: "/comunidade?novo=publicacao" },
    ...(isRemoteAuth ? [{ icon: Camera, title: "Momentos", tone: "terra" as const, to: "/comunidade?novo=momento" }] : []),
    ...(isRemoteAuth && isFeatureOn(config, "calendar", house.id) ? [{ icon: CalendarDays, title: "Agenda", tone: "verde" as const, to: `/casa/${house.id}?aba=calendario` }] : []),
    ...(isRemoteAuth && isFeatureOn(config, "reviews", house.id) ? [{ icon: Star, title: "Avaliações", tone: "ouro" as const, to: `/casa/${house.id}?aba=avaliacoes` }] : []),
    { icon: TrendingUp, title: "Crescer", tone: "ouro", to: "/impulsionar" },
    ...(isRemoteAuth ? [{ icon: Crown, title: "Planos", tone: "ouro" as const, to: "/planos", badge: badges.faturas }] : []),
    ...(isRemoteAuth ? [{ icon: Landmark, title: "Recebimentos", tone: "ouro" as const, to: "/recebimentos" }] : []),
    ...(isRemoteAuth ? [{ icon: Megaphone, title: "Divulgação", tone: "terra" as const, to: "/divulgacao", needs: "campaign_links" as CapNumberKey, about: "Crie links próprios por rede social, cartões para postar e respostas rápidas, e veja de onde vêm as visitas." }] : []),
    ...(isRemoteAuth ? [{ icon: UsersRound, title: "Equipe", tone: "verde" as const, to: "/equipe", needs: "included_seats" as CapNumberKey, about: "Convide quem ajuda a atender a casa e escolha o que cada pessoa pode ver." }] : []),
    { icon: Bot, title: "Assistente", tone: "noite", to: "/perfil" },
    { icon: Pencil, title: "Editar página", tone: "verde", to: `/casa/${house.id}?editar=1` },
    { icon: Leaf, title: "Minha página", tone: "verde", to: `/casa/${house.id}` },
  ];

  // Ferramenta de plano acima do atual: selo discreto com o plano que a inclui (continua clicável; o aviso explica).
  const planTag = (t: Tool): string | null => {
    if (!t.needs || !plan) return null;
    const min = minPlanFor(config.plan_matrix, t.needs);
    if (!min || HOUSE_PLAN_IDS.indexOf(plan) >= HOUSE_PLAN_IDS.indexOf(min)) return null;
    return min === "gratis" ? FREE_PLAN_NAME : config.pricing.plans[min].name;
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      {isRemoteAuth && <BillingAlertCard />}
      <Card className="relative overflow-hidden p-6 border-0 text-white shadow-altar" style={{ background: "linear-gradient(135deg, #14543F 0%, #0F3B2D 100%)" }}>
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #F4DC92 1px, transparent 0)", backgroundSize: "26px 26px" }} aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="relative">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold">Painel da casa</div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl mt-1 break-words">Olá, {house.name}</h1>
          <p className="text-sm text-white/75 mt-1">O que precisa de você hoje.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="gold" onClick={() => nav(`/casa/${house.id}`)}>Ver minha página</Button>
          </div>
        </div>
      </Card>

      {isRemoteAuth && <HousePendingCard />}

      {isRemoteAuth && <HouseKpis ownerId={house.id} />}

      {/* Só aparece enquanto falta cadastrar o recebimento; depois que está ativo, a casa o encontra em Recebimentos. */}
      {isRemoteAuth && <PaymentAccountCard ownerId={house.id} termsOk={termsOk} required={plan === "gratis"} hideWhenReady />}

      <section aria-labelledby="ferramentas" className="space-y-2">
        <h2 id="ferramentas" className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Ferramentas</h2>
        <div className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-5 xl:grid-cols-6">
          {tools.map((t) => {
            const pn = planTag(t);
            return pn && t.about
              ? <ToolTile key={t.title} icon={t.icon} label={t.title} tone={t.tone} note={`Plano ${pn}`} onClick={() => setUpsell({ title: t.title, about: t.about!, planName: pn, to: t.to })} />
              : <ToolTile key={t.title} icon={t.icon} label={t.title} tone={t.tone} to={t.to} badge={t.badge} />;
          })}
        </div>
      </section>

      {isRemoteAuth && <HouseIndicatorsCard />}
      {isRemoteAuth && <PromoList title="Destaque e impulsionamento em andamento" />}

      <PlanUpsellModal
        tool={upsell}
        planName={upsell?.planName ?? ""}
        onClose={() => setUpsell(null)}
        onPlans={() => { setUpsell(null); nav("/planos?aba=mudar"); }}
        onHow={() => { const go = upsell?.to; setUpsell(null); if (go) nav(go); }}
      />

      <Collapse id="casa-divulgar" title="Divulgar a casa" hint="compartilhar e indicar">
        <ShareHouseCard />
        <ReferralCard />
      </Collapse>
      <Collapse id="casa-assistente" title="Assistente" hint="relatório dos atendimentos">
        <AssistantReportCard />
      </Collapse>
      <Collapse id="casa-preferencias" title="Preferências" hint="horário de silêncio, modo discreto, avisos">
        <SocialNoticesCard />
        <QuietHoursCard />
        <DiscreetModeCard />
      </Collapse>
    </div>
  );
}
