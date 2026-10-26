import { useApp } from "@/contexts/AppContext";
import { Badge, Button, Card } from "@/components/base";
import PromoPicker from "@/components/promo/PromoPicker";
import { BOOST_PER_DAY, type BoostScope } from "@/lib/pricing";
import { isPromotionActive } from "@/lib/utils";
import { Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Boost() {
  const { currentUser, applyBoost, isRemoteAuth } = useApp();
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

  return (
    <div className="space-y-6 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Impulsionar</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Faça a sua casa aparecer para mais gente na sua cidade, no seu estado ou no país inteiro. O valor é por dia: escolha o alcance e por quantos dias.
        </p>
        {isPromotionActive(currentUser.boost?.expiresAt) && currentUser.boost && (
          <Badge tone="gold" className="mt-4">
            <Sparkles className="h-3 w-3" /> Impulsionamento demonstrativo: {currentUser.boost.level} até {new Date(currentUser.boost.expiresAt).toLocaleDateString("pt-BR")}
          </Badge>
        )}
      </Card>

      <PromoPicker<BoostScope>
        scopes={[
          { key: "cidade", label: "Cidade", description: "Para quem está na mesma cidade da casa.", perDay: BOOST_PER_DAY.cidade },
          { key: "estado", label: "Estado", description: "Alcance em todo o estado.", perDay: BOOST_PER_DAY.estado },
          { key: "pais", label: "País", description: "A casa exibida no Brasil inteiro.", perDay: BOOST_PER_DAY.pais },
        ]}
        canSimulate={!isRemoteAuth}
        disabledReason="Contratação disponível em breve"
        onSimulate={(scope, days) => {
          applyBoost(scope, days);
          toast.success(`Simulação local: ${scope} por ${days} dias. Nenhuma cobrança foi feita.`);
        }}
      />
    </div>
  );
}
