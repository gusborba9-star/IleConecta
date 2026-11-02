import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { Badge, Button, Card } from "@/components/base";
import PromoPicker from "@/components/promo/PromoPicker";
import { availableScopes, isFeatureOn } from "@/lib/platformConfig";
import { SCOPE_LABEL } from "@/lib/pricing";
import { isPromotionActive } from "@/lib/utils";
import { Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Boost() {
  const { currentUser, applyBoost, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const nav = useNavigate();

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
          Faça a sua casa aparecer para mais gente. O valor é por dia: escolha o alcance e por quantos dias.
        </p>
        {isPromotionActive(currentUser.boost?.expiresAt) && currentUser.boost && (
          <Badge tone="gold" className="mt-4">
            <Sparkles className="h-3 w-3" /> Impulsionamento demonstrativo: {currentUser.boost.level} até {new Date(currentUser.boost.expiresAt).toLocaleDateString("pt-BR")}
          </Badge>
        )}
      </Card>

      {!enabled || scopes.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">O impulsionamento ainda não está disponível para a sua casa. Em breve.</Card>
      ) : (
        <PromoPicker
          scopes={scopes}
          canSimulate={!isRemoteAuth}
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
