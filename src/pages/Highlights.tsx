import GrowTabs from "@/components/panel/GrowTabs";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { Badge, Button, Card } from "@/components/base";
import PromoPicker from "@/components/promo/PromoPicker";
import { availableScopes, isFeatureOn } from "@/lib/platformConfig";
import { SCOPE_LABEL } from "@/lib/pricing";
import { isPromotionActive } from "@/lib/utils";
import { Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import PromoList from "@/components/promo/PromoList";
import { buyPromotion, fetchPromoAvailability, joinPromoWaitlist, leavePromoWaitlist } from "@/lib/promotions";
import { readAvailability, type PromoScopeKey } from "@/lib/promotionsCore";
import { useChargeReturn } from "@/lib/useChargeReturn";

export default function Highlights() {
  const { currentUser, applyHighlight, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const nav = useNavigate();
  const isHouse = currentUser?.type === "commercial";
  const [avail, setAvail] = useState(() => readAvailability(null));
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => {
    if (!isRemoteAuth || !isHouse) return;
    void fetchPromoAvailability().then(setAvail);
  }, [isRemoteAuth, isHouse]);
  useEffect(reload, [reload, tick]);
  useChargeReturn(isRemoteAuth && isHouse, (paid) => {
    if (paid) toast.success("Pagamento confirmado. O destaque já começou.");
    else toast.info("Pagamento não concluído. Nada foi cobrado.");
    setTick((n) => n + 1);
  });

  if (!currentUser || currentUser.type !== "commercial") {
    return (
      <Card className="p-8 text-center">
        <h1 className="font-display text-2xl mb-2">Área exclusiva das casas</h1>
        <p className="text-muted-foreground mb-4">Apenas contas de casa podem contratar destaques.</p>
        <Button onClick={() => nav("/")}>Voltar ao feed</Button>
      </Card>
    );
  }

  const enabled = isFeatureOn(config, "highlight", currentUser.id);
  const scopes = availableScopes(config, "highlight").map((key) => ({
    key,
    label: SCOPE_LABEL[key].label,
    description: SCOPE_LABEL[key].description,
    perDay: config.pricing.highlight_per_day[key],
  }));

  return (
    <div className="space-y-6 pb-16 lg:pb-4">
      <GrowTabs active="destaques" />
      <Card className="p-6 bg-gradient-to-br from-[#FBF2DE] via-transparent to-gold/10 dark:from-gold/15 border-gold/40 shadow-card">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-5 w-5 text-gold" />
          <h1 className="font-display font-bold text-2xl">Destaques nos feeds</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          A sua casa aparece primeiro nas buscas da região escolhida. O valor é por dia, de acordo com a região e a quantidade de dias. As vagas são limitadas por alcance.
        </p>
        {isPromotionActive(currentUser.highlight?.expiresAt) && currentUser.highlight && (
          <Badge tone="gold" className="mt-4">
            <Sparkles className="h-3 w-3" /> Simulação ativa: {currentUser.highlight.scope} até {new Date(currentUser.highlight.expiresAt).toLocaleDateString("pt-BR")}
          </Badge>
        )}
      </Card>

      {!enabled || scopes.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">O destaque ainda não está disponível para a sua casa. Em breve.</Card>
      ) : isRemoteAuth ? (
        <>
          <PromoPicker
            scopes={scopes.map((x) => {
              const a = avail.scopes[x.key as PromoScopeKey];
              const slots = a && a.limit > 0 ? ` · ${a.taken} de ${a.limit} vagas ocupadas` : "";
              return { ...x, description: `${x.description}${a?.mine ? " · Você já está em destaque aqui" : slots}` };
            })}
            canSimulate={false}
            disabledReason=""
            real={{
              busy,
              blocked: Object.fromEntries(scopes.flatMap((x) => {
                const a = avail.scopes[x.key as PromoScopeKey];
                if (!a) return [];
                if (!a.located) return [[x.key, "Complete a cidade e o estado no perfil da casa para contratar este alcance."]];
                if (a.full) return [[x.key, "Todas as vagas deste alcance estão ocupadas no momento."]];
                return [];
              })),
              onBuy: async (scope, days, authorized) => {
                setBusy(true);
                const r = await buyPromotion({ kind: "highlight", scope: scope as PromoScopeKey, days, authorized });
                setBusy(false);
                if (r.error) {
                  toast.error(r.error);
                  if (r.full) setTick((n) => n + 1);
                }
              },
              extra: (scope) => {
                const a = avail.scopes[scope as PromoScopeKey];
                if (!a?.full) return null;
                return (
                  <Button variant="outline" className="mt-3 w-full !bg-white/10 !text-white !border-white/25 hover:!bg-white/20" onClick={async () => {
                    if (a.waiting) await leavePromoWaitlist(scope as PromoScopeKey);
                    else {
                      const err = await joinPromoWaitlist(scope as PromoScopeKey);
                      if (err) return void toast.error("Não foi possível entrar na lista de espera agora.");
                      toast.success("Pronto! Avisamos você assim que abrir uma vaga.");
                    }
                    setTick((n) => n + 1);
                  }}>
                    {a.waiting ? "Sair da lista de espera" : "Avise-me quando abrir vaga"}
                  </Button>
                );
              },
            }}
          />
          <PromoList kind="highlight" refreshKey={tick} title="Seu destaque" />
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
            applyHighlight(scope, days);
            toast.success(`Simulação local: destaque ${scope} por ${days} dias. Nenhuma cobrança foi feita.`);
          }}
        />
      )}
    </div>
  );
}
