import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { trackHouseSignal } from "@/lib/houseSignals";
import HouseMemberButton from "@/components/members/HouseMemberButton";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { Camera, CheckCircle2, ChevronDown, MapPin, MessageCircle, Pencil, Star, TrendingUp, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { fetchFollowSummary, setFollowing } from "@/lib/follows";
import EditProfileModal from "@/components/profile/EditProfileModal";
import PostCard from "@/components/feed/PostCard";
import RitualCard from "@/components/feed/RitualCard";
import { cn, isPromotionActive } from "@/lib/utils";
import { isRemoteId } from "@/lib/remoteData";
import AssistantChat from "@/components/assistant/AssistantChat";
import ServicesTab from "@/components/services/ServicesTab";
import RitualsTab from "@/components/rituals/RitualsTab";
import HouseRefundCases from "@/components/refunds/HouseRefundCases";
import ReviewsTab from "@/components/reviews/ReviewsTab";
import CalendarTab from "@/components/calendar/CalendarTab";
import { fetchHouseCalendar, type CalendarItem } from "@/lib/calendar";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";
const MomentViewer = lazy(() => import("@/components/feed/MomentViewer"));
const MomentComposer = lazy(() => import("@/components/feed/MomentComposer"));
import PostComposer from "@/components/feed/PostComposer";
import HouseActionsMenu from "@/components/house/HouseActionsMenu";
import PlanUpsellModal from "@/components/house/PlanUpsellModal";
import { useOwnerPlan } from "@/lib/housePlan";
import { minPlanFor } from "@/lib/planMatrixCore";
import { FREE_PLAN_NAME } from "@/lib/platformConfigCore";
import { fetchMomentGroups } from "@/lib/moments";
import { canPostMoments, isGroupSeen, startIndex, type MomentGroup } from "@/lib/momentsCore";
import { readSeen, saveSeen } from "@/lib/momentsSeen";

type Tab = "feed" | "servicos" | "rituais" | "calendario" | "avaliacoes" | "assistente";
const TAB_LABEL: Record<Tab, string> = { feed: "Publicações", servicos: "Serviços", rituais: "Rituais", calendario: "Calendário", avaliacoes: "Avaliações", assistente: "Assistente" };

export default function HousePage() {
  const { id } = useParams();
  const { getHouse, posts, rituals, currentUser, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const house = getHouse(id ?? "");
  const nav = useNavigate();
  const [params] = useSearchParams();
  const startTab = params.get("aba");
  const [tab, setTab] = useState<Tab>(startTab === "servicos" ? "servicos" : startTab === "rituais" ? "rituais" : startTab === "avaliacoes" ? "avaliacoes" : startTab === "calendario" ? "calendario" : "feed");
  // Link para a mesma página com outra aba (ex.: "Reservar" no cartão da gira, estando já na casa): troca a aba e leva até ela.
  const tabsRef = useRef<HTMLDivElement>(null);
  const locKey = useLocation().key;
  useEffect(() => {
    const t: Tab | null = startTab === "servicos" ? "servicos" : startTab === "rituais" ? "rituais" : startTab === "avaliacoes" ? "avaliacoes" : startTab === "calendario" ? "calendario" : null;
    if (!t) return;
    setTab(t);
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [startTab, locKey]);
  const [editing, setEditing] = useState(params.get("editar") === "1" && currentUser?.id === id);
  const [following, setFollowingState] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followDelta, setFollowDelta] = useState(0);
  const [reviewRef, setReviewRef] = useState<string | null>(null);
  const realHouse = isRemoteAuth && isRemoteId(id ?? "");
  useEffect(() => { if (id && isRemoteId(id)) trackHouseSignal(id, "visita"); }, [id]);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const calendarOn = realHouse && isFeatureOn(config, "calendar", id ?? "");
  // Momentos no ar desta casa: o avatar ganha o aro dourado e abre o visualizador.
  const [momentGroup, setMomentGroup] = useState<MomentGroup | null>(null);
  const [momentOpen, setMomentOpen] = useState(false);
  const [momentSeen, setMomentSeen] = useState<Set<string>>(readSeen);
  const [momentReload, setMomentReload] = useState(0);
  useEffect(() => {
    setMomentGroup(null);
    if (!realHouse || !id) return;
    let alive = true;
    void fetchMomentGroups().then((gs) => alive && setMomentGroup(gs.find((g) => g.ownerId === id) ?? null));
    return () => { alive = false; };
  }, [id, realHouse, momentReload]);
  // Perfil enxuto: o resto das informações abre na seta; "Adicionar momento" respeita o plano da casa.
  const [infoOpen, setInfoOpen] = useState(false);
  const [composingMoment, setComposingMoment] = useState(false);
  const [momentUpsell, setMomentUpsell] = useState(false);
  const { caps: ownCaps } = useOwnerPlan(realHouse && currentUser?.id === id ? id : null);
  const loadCalendar = useCallback(() => {
    if (!calendarOn || !id) return setCalendar([]);
    void fetchHouseCalendar(id).then((c) => setCalendar(c.enabled ? c.items : []));
  }, [calendarOn, id]);
  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);
  useEffect(() => {
    setFollowingState(false);
    setFollowDelta(0);
    if (!realHouse || !id) return;
    let alive = true;
    void fetchFollowSummary().then((s) => alive && setFollowingState(s.mine.includes(id)));
    return () => {
      alive = false;
    };
  }, [id, realHouse]);
  const toggleFollow = async () => {
    if (!id || followBusy) return;
    setFollowBusy(true);
    const next = !following;
    const error = await setFollowing(id, next);
    setFollowBusy(false);
    if (error) return void toast.error(error);
    setFollowingState(next);
    setFollowDelta((d) => d + (next ? 1 : -1));
    toast.success(next ? "Você agora segue esta casa." : "Você deixou de seguir esta casa.");
  };
  const housePosts = house ? posts.filter((p) => p.houseId === house.id) : [];
  const houseRituals = house ? rituals.filter((r) => r.houseId === house.id) : [];

  if (!house)
    return (
      <div className="p-8 text-center">
        <h1 className="font-display text-2xl">Casa indisponível</h1>
        <Button className="mt-4" onClick={() => nav("/")}>Voltar ao feed</Button>
      </div>
    );

  const followers = Math.max(0, house.followers + followDelta);
  const isOwn = currentUser?.id === house.id;
  const hasAssistant = isRemoteAuth && isRemoteId(house.id) && !isOwn && isFeatureOn(config, "assistant", house.id);
  const hasServices = isRemoteAuth && isRemoteId(house.id);
  const hasReviews = hasServices && isFeatureOn(config, "reviews", house.id);
  const tabs: Tab[] = ["feed", ...(hasServices ? (["servicos"] as Tab[]) : []), "rituais", ...(calendarOn && (isOwn || calendar.length > 0) ? (["calendario"] as Tab[]) : []), ...(hasReviews ? (["avaliacoes"] as Tab[]) : []), ...(hasAssistant ? (["assistente"] as Tab[]) : [])];
  const momentMinPlan = minPlanFor(config.plan_matrix, "moments_per_day");
  const momentPlanName = !momentMinPlan ? "superior" : momentMinPlan === "gratis" ? FREE_PLAN_NAME : config.pricing.plans[momentMinPlan].name;
  const addMoment = () => (canPostMoments(ownCaps) ? setComposingMoment(true) : setMomentUpsell(true));
  const longBio = (house.bio ?? "").length > 140;
  const activeBoost = isPromotionActive(house.boost?.expiresAt) ? house.boost : undefined;

  return (
    <div className="pb-16 lg:pb-4">
      <Card className="overflow-hidden">
        {/* Capa em faixa própria: a foto de perfil sobe só um pouco e nada do texto fica por baixo dela. */}
        <div className="relative isolate h-36 sm:h-48 md:h-60 bg-muted overflow-hidden">
          <img src={house.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-forest/60 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
          {activeBoost && (
            <Badge tone="gold" className="sheen absolute top-3 left-3 shadow-card">
              <TrendingUp className="h-3 w-3" /> Impulsionamento demonstrativo · {activeBoost.level}
            </Badge>
          )}
          <div className="absolute right-3 top-3 z-10">
            <HouseActionsMenu house={house} isOwn={isOwn} remote={isRemoteAuth} />
          </div>
        </div>
        <div className="relative z-10 px-4 sm:px-6 pb-5 text-center">
          <div className={cn("-mt-14 sm:-mt-16 mx-auto flex w-fit rounded-full p-1.5 bg-card shadow-card [&>*]:flex [&_img]:block", momentGroup ? "" : "ring-1 ring-gold/60")}>
            {momentGroup ? (
              <button type="button" onClick={() => setMomentOpen(true)} aria-label={`Ver os momentos de ${house.name}`} className={cn("flex rounded-full leading-none ring-2 ring-offset-2 ring-offset-card focus-visible:outline-none focus-visible:ring-4", isGroupSeen(momentGroup, momentSeen) ? "ring-border" : "ring-gold")}>
                <Avatar src={house.avatar} name={house.name} size={104} />
              </button>
            ) : (
              <Avatar src={house.avatar} name={house.name} size={104} />
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-2xl md:text-3xl leading-tight break-words min-w-0">{house.name}</h1>
            {house.verified && <Badge tone="gold"><CheckCircle2 className="h-3 w-3" /> Verificada</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {[house.city, house.state].filter(Boolean).join(", ")}</span>
            {house.category && (<><span aria-hidden>·</span><span>{house.category}</span></>)}
          </div>
          {(followers > 0 || house.rating > 0) && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-sm font-semibold">
              {followers > 0 && <span>{followers.toLocaleString("pt-BR")} {followers === 1 ? "seguidor" : "seguidores"}</span>}
              {followers > 0 && house.rating > 0 && <span aria-hidden className="text-muted-foreground">·</span>}
              {house.rating > 0 && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-gold fill-gold" aria-hidden /> {house.rating.toFixed(1)}</span>}
            </div>
          )}
          {house.bio && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground line-clamp-2">{house.bio}</p>}

          <div className="mt-4 flex items-stretch gap-2">
            {isOwn ? (
              <>
                {realHouse && (
                  <Button variant="gold" className="h-auto min-h-11 min-w-0 flex-1 px-3 py-2 leading-tight" onClick={addMoment}>
                    <Camera className="h-4 w-4 shrink-0" aria-hidden /> <span className="min-w-0">Adicionar momento</span>
                  </Button>
                )}
                <Button variant="outline" className="h-auto min-h-11 min-w-0 flex-1 px-3 py-2 leading-tight" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 shrink-0" aria-hidden /> <span className="min-w-0">Editar página</span>
                </Button>
              </>
            ) : (
              <>
                <Button className="h-auto min-h-11 min-w-0 flex-1 px-3 py-2" onClick={() => nav(`/mensagens/${house.id}`)}><MessageCircle className="h-4 w-4 shrink-0" aria-hidden /> Chat</Button>
                {realHouse && currentUser?.type !== "commercial" && <HouseMemberButton ownerId={house.id} />}
                {realHouse ? (
                  <Button variant={following ? "secondary" : "outline"} className="h-auto min-h-11 min-w-0 flex-1 px-3 py-2" disabled={followBusy} aria-pressed={following} onClick={() => void toggleFollow()}>
                    {following ? <UserCheck className="h-4 w-4 shrink-0" aria-hidden /> : <UserPlus className="h-4 w-4 shrink-0" aria-hidden />} {following ? "Seguindo" : "Seguir"}
                  </Button>
                ) : (
                  <Button variant="outline" className="h-auto min-h-11 min-w-0 flex-1 px-3 py-2" disabled title="Seguir só funciona com conta real"><UserPlus className="h-4 w-4 shrink-0" aria-hidden /> Seguir</Button>
                )}
              </>
            )}
            <button
              type="button"
              aria-expanded={infoOpen}
              aria-controls="casa-informacoes"
              aria-label={infoOpen ? "Esconder informações da casa" : "Mostrar informações da casa"}
              onClick={() => setInfoOpen((v) => !v)}
              className="grid h-11 w-11 shrink-0 place-items-center self-center rounded-2xl border border-border bg-muted/50 text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown className={cn("h-5 w-5 transition-transform", infoOpen && "rotate-180")} aria-hidden />
            </button>
          </div>

          {infoOpen && (
            <div id="casa-informacoes" className="mt-4 space-y-3 text-left animate-fade-in">
              {longBio && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sobre a casa</div>
                  <p className="mt-1 text-sm whitespace-pre-line break-words">{house.bio}</p>
                </div>
              )}
              {house.offerings && (
                <div className="rounded-2xl border border-gold/30 bg-gold/10 p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Trabalhos que a casa realiza</div>
                  <p className="mt-1 text-sm whitespace-pre-line break-words">{house.offerings}</p>
                  {!isOwn && <p className="mt-2 text-xs text-muted-foreground">Não encontrou o que procura nas publicações? Fale com a casa ou com a assistente.</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Categoria" value={house.category || "—"} />
                <Stat label="Localização" value={[house.city, house.state].filter(Boolean).join(" · ") || "—"} />
                {followers > 0 && <Stat label="Seguidores" value={followers.toLocaleString("pt-BR")} />}
                {house.rating > 0 && <Stat label="Avaliação" value={`${house.rating.toFixed(1)} ★`} />}
              </div>
              {house.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {house.tags.map((t) => (<Badge key={t} tone="muted">{t}</Badge>))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {isOwn && <div className="mt-3"><PostComposer /></div>}

      {/* Abas só com a palavra, em faixa que rola de lado (o degradê da direita avisa que há mais). */}
      <div className="relative mt-3">
        <div ref={tabsRef} className="scroll-x flex gap-1 scroll-mt-20 rounded-2xl border border-border bg-card px-2 whitespace-nowrap" role="tablist" aria-label="Seções da página">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => { if (t !== "avaliacoes") setReviewRef(null); setTab(t); }}
              className={cn(
                "shrink-0 border-b-[3px] px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-card to-transparent" />
      </div>

      {isOwn && <EditProfileModal open={editing} onClose={() => setEditing(false)} />}
      {isOwn && composingMoment && <Suspense fallback={null}><MomentComposer open ownerId={house.id} caps={ownCaps} onClose={() => setComposingMoment(false)} onPublished={() => setMomentReload((n) => n + 1)} /></Suspense>}
      <PlanUpsellModal
        tool={momentUpsell ? { title: "Momentos", about: "Publique fotos que ficam 24 horas no topo da Comunidade e no aro da foto da sua casa, com texto e música." } : null}
        planName={momentPlanName}
        onClose={() => setMomentUpsell(false)}
        onPlans={() => { setMomentUpsell(false); nav("/planos?aba=mudar"); }}
      />
      {momentOpen && momentGroup && (
        <Suspense fallback={null}><MomentViewer groups={[momentGroup]} start={{ gi: 0, ii: startIndex(momentGroup, momentSeen) }} viewerId={currentUser?.id} onClose={() => setMomentOpen(false)}
          onSeen={(sid) => setMomentSeen((prev) => { if (prev.has(sid)) return prev; const n = new Set(prev); n.add(sid); saveSeen(n, [...n]); return n; })} /></Suspense>
      )}
      {isOwn && hasServices && <HouseRefundCases ownerId={house.id} />}

      <div className="mt-4 space-y-4">
        {tab === "feed" && housePosts.map((p) => <PostCard key={p.id} post={p} />)}
        {tab === "feed" && housePosts.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Ainda não há publicações desta casa.</Card>
        )}
        {tab === "rituais" && hasServices && <RitualsTab ownerId={house.id} isOwn={isOwn} startNew={params.get("novo") === "1"} onAskAssistant={hasAssistant ? () => setTab("assistente") : undefined} />}
        {tab === "rituais" && !hasServices && houseRituals.map((r) => <RitualCard key={r.id} ritual={r} />)}
        {tab === "rituais" && !hasServices && houseRituals.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Esta casa ainda não publicou rituais.</Card>
        )}
        {tab === "servicos" && hasServices && <ServicesTab ownerId={house.id} isOwn={isOwn} startNew={params.get("novo") === "1"} onAskAssistant={hasAssistant ? () => setTab("assistente") : undefined} onReview={hasReviews && !isOwn && currentUser?.type === "personal" ? (orderId) => { setReviewRef(orderId); setTab("avaliacoes"); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined} />}
        {tab === "calendario" && calendarOn && <CalendarTab items={calendar} isOwn={isOwn} onChanged={loadCalendar} />}
        {tab === "avaliacoes" && hasReviews && <ReviewsTab ownerId={house.id} isOwn={isOwn} canReview={currentUser?.type === "personal"} onlyRef={reviewRef} onShowAll={() => setReviewRef(null)} />}
        {tab === "assistente" && hasAssistant && <AssistantChat houseId={house.id} houseName={house.name} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/50 border border-border p-3 pillow">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-base mt-0.5 break-words">{value}</div>
    </div>
  );
}
