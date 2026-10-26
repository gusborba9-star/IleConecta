import { useApp } from "@/contexts/AppContext";
import { Badge, Button, Card } from "@/components/base";
import PromoPicker from "@/components/promo/PromoPicker";
import { HIGHLIGHT_PER_DAY, type HighlightScope } from "@/lib/pricing";
import { isPromotionActive } from "@/lib/utils";
import { Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Highlights() {
  const { currentUser, applyHighlight, isRemoteAuth } = useApp();
  const nav = useNavigate();

  if (!currentUser || currentUser.type !== "commercial") {
    return (
      <Card className="p-8 text-center">
        <div className="font-display text-2xl mb-2">Área exclusiva das casas</div>
        <p className="text-muted-foreground mb-4">Apenas contas de casa podem contratar destaques.</p>
        <Button onClick={() => nav("/")}>Voltar ao feed</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-gold/20 via-transparent to-primary/10 border-gold/40">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-5 w-5 text-gold" />
          <h1 className="font-display font-bold text-2xl">Destaques nos feeds</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Coloque a sua casa em evidência nos feeds da região escolhida. O valor é por dia, de acordo com a região e a quantidade de dias.
        </p>
        {isPromotionActive(currentUser.highlight?.expiresAt) && currentUser.highlight && (
          <Badge tone="gold" className="mt-4">
            <Sparkles className="h-3 w-3" /> Simulação ativa: {currentUser.highlight.scope} até {new Date(currentUser.highlight.expiresAt).toLocaleDateString("pt-BR")}
          </Badge>
        )}
      </Card>

      <PromoPicker<HighlightScope>
        scopes={[
          { key: "local", label: "Bairro", description: "Em evidência para a vizinhança da casa.", perDay: HIGHLIGHT_PER_DAY.local },
          { key: "cidade", label: "Cidade", description: "Em evidência nos feeds de toda a cidade.", perDay: HIGHLIGHT_PER_DAY.cidade },
          { key: "pais", label: "País", description: "Na home nacional.", perDay: HIGHLIGHT_PER_DAY.pais },
        ]}
        canSimulate={!isRemoteAuth}
        disabledReason="Contratação disponível em breve"
        onSimulate={(scope, days) => {
          applyHighlight(scope, days);
          toast.success(`Simulação local: destaque ${scope} por ${days} dias. Nenhuma cobrança foi feita.`);
        }}
      />
    </div>
  );
}
