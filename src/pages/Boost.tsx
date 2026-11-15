import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { Badge, Button, Card } from "@/components/base";
import PromoPicker from "@/components/promo/PromoPicker";
import { availableScopes, isFeatureOn } from "@/lib/platformConfig";
import { SCOPE_LABEL } from "@/lib/pricing";
import { isPromotionActive } from "@/lib/utils";
import { Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import PromoList from "@/components/promo/PromoList";
import { buyPromotion } from "@/lib/promotions";
import type { PromoScopeKey } from "@/lib/promotionsCore";
import { useChargeReturn } from "@/lib/useChargeReturn";
import { fetchServices, type Service } from "@/lib/services";
import { fetchHouseRituals, type RealRitual } from "@/lib/rituals";

export default function Boost() {
  const { currentUser, applyBoost, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const isHouse = currentUser?.type === "commercial";
  const ownerId = currentUser?.id;
  const [services, setServices] = useState<Service[]>([]);
  const [rituals, setRituals] = useState<RealRitual[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [item, setItem] = useState(() => params.get("item") ?? "");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => {
    if (!isRemoteAuth || !isHouse || !ownerId) return;
    void Promise.all([fetchServices(ownerId), fetchHouseRituals(ownerId)]).then(([s, r]) => {
      setServices(s.filter((x) => x.active && x.listed));
      setRituals(r.filter((x) => x.status === "publicado" && Date.parse(x.startsAt) > Date.now()));
      setLoaded(true);
    });
  }, [isRemoteAuth, isHouse, ownerId]);
  useEffect(load, [load]);
  useChargeReturn(isRemoteAuth && isHouse, (paid) => {
    if (paid) toast.success("Pagamento confirmado. O impulsionamento já começou.");
    else toast.info("Pagamento não concluído. Nada foi cobrado.");
    setTick((n) => n + 1);
  });
  const options = useMemo(() => [
    ...services.map((x) => ({ key: `service:${x.id}`, label: `Serviço · ${x.title}`, maxDays: 90 })),
    ...rituals.map((x) => ({ key: `event:${x.id}`, label: `Ritual · ${x.title}`, maxDays: Math.max(0, Math.floor((Date.parse(x.startsAt) - Date.now()) / 86400000)) })),
  ], [services, rituals]);
  const chosen = options.find((o) => o.key === item) ?? null;

  if (!currentUser || currentUser.type !== "commercial") {
    return (
      <Card className="p-8 text-center">
        <div className="font-display text-2xl mb-2">Área exclusiva das casas</div>
        <p className="text-muted-foreground mb-4">Apenas contas de casa podem impulsionar a página.</p>
        <Button onClick={() => nav("/")}>Voltar ao feed</Button>
      </Card>
    );
  }

  const enabled = isFeatureOn(config, "boost", currentUser.id);
  const scopes = availableScopes(config, "boost").map((key) => ({
    key,
    label: SCOPE_LABEL[key].label,
    description: SCOPE_LABEL[key].description,
    perDay: config.pricing.boost_per_day[key],
  }));

  return (
    <div className="space-y-6 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-[#EEE9F5] via-transparent to-gold/10 dark:from-plum/15 border-plum/30 shadow-card">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Impulsionar</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Leve um serviço ou ritual da sua casa para mais gente. O valor é por dia: escolha o alcance e por quantos dias.
        </p>
        {isPromotionActive(currentUser.boost?.expiresAt) && currentUser.boost && (
          <Badge tone="gold" className="mt-4">
            <Sparkles className="h-3 w-3" /> Impulsionamento demonstrativo: {currentUser.boost.level} até {new Date(currentUser.boost.expiresAt).toLocaleDateString("pt-BR")}
          </Badge>
        )}
      </Card>

      {!enabled || scopes.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">O impulsionamento ainda não está disponível para a sua casa. Em breve.</Card>
      ) : isRemoteAuth ? (
        <>
          <Card className="p-5">
            <h2 className="font-display font-bold text-lg">O que você quer impulsionar?</h2>
            <p className="text-sm text-muted-foreground mt-1">Escolha um serviço ou ritual. Cada um tem o seu próprio impulso: novos dias do mesmo item e alcance entram ao final do atual.</p>
            {loaded && options.length === 0 ? (
              <p className="mt-3 text-sm">Você ainda não tem serviço ativo ou ritual publicado. <Button variant="outline" size="sm" className="ml-2" onClick={() => nav("/painel")}>Ir ao painel</Button></p>
            ) : (
              <select aria-label="Item a impulsionar" className="mt-3 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm" value={chosen?.key ?? ""} onChange={(e) => setItem(e.target.value)}>
                <option value="">Escolha…</option>
                {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            )}
          </Card>
          {chosen && chosen.maxDays < 1 ? (
            <Card className="p-5 text-sm text-muted-foreground">Este ritual acontece em menos de um dia inteiro, então já não dá para impulsionar.</Card>
          ) : chosen ? (
            <PromoPicker
              key={chosen.key}
              scopes={scopes}
              canSimulate={false}
              disabledReason=""
              maxDays={chosen.maxDays}
              real={{
                busy,
                onBuy: async (scope, days, authorized) => {
                  if (scope === "exterior") return;
                  const [t, id] = chosen.key.split(":");
                  setBusy(true);
                  const r = await buyPromotion({ kind: "boost", scope: scope as PromoScopeKey, days, itemType: t as "service" | "event", itemId: id, authorized });
                  setBusy(false);
                  if (r.error) toast.error(r.error);
                },
              }}
            />
          ) : null}
          <PromoList kind="boost" refreshKey={tick} title="Seus impulsionamentos" />
        </>
      ) : (
        <PromoPicker
          scopes={scopes}
          canSimulate
          disabledReason="Contratação disponível em breve"
          onSimulate={(scope, days) => {
            if (scope === "exterior") {
              toast.info("A simulação do exterior ainda não está disponível.");
              return;
            }
            applyBoost(scope, days);
            toast.success(`Simulação local: ${scope} por ${days} dias. Nenhuma cobrança foi feita.`);
          }}
        />
      )}
    </div>
  );
}
