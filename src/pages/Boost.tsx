import { useApp } from "@/contexts/AppContext";
import { boostCatalog, highlightCatalog } from "@/lib/mockData";
import { Badge, Button, Card } from "@/components/base";
import { formatBRL } from "@/lib/utils";
import { Flame, Sparkles, TrendingUp, Star, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Boost() {
  const { currentUser, applyBoost, applyHighlight } = useApp();
  const nav = useNavigate();

  if (!currentUser || currentUser.type !== "commercial") {
    return (
      <Card className="p-8 text-center">
        <div className="font-display text-2xl mb-2">Área exclusiva das casas</div>
        <p className="text-muted-foreground mb-4">Apenas contas comerciais podem impulsionar a marca.</p>
        <Button onClick={() => nav("/")}>Voltar ao feed</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-52 w-52 rounded-full bg-gold/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="font-display font-bold text-2xl">Impulsione sua casa</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Alcance mais fiéis e potencialize suas contratações. Escolha o alcance geográfico e o tempo de exibição.
          </p>
          {currentUser.boost && (
            <Badge tone="gold" className="mt-4">
              <Sparkles className="h-3 w-3" /> Boost ativo: {currentUser.boost.level} até{" "}
              {new Date(currentUser.boost.expiresAt).toLocaleDateString("pt-BR")}
            </Badge>
          )}
        </div>
      </Card>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Flame className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-xl">Planos de impulsionamento</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["cidade", "estado", "pais"] as const).map((level) => (
            <Card key={level} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-primary" />
                <div className="font-display font-bold text-lg capitalize">
                  {level === "pais" ? "Brasil" : level}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {level === "cidade"
                  ? "Sua casa aparece em destaque para usuários da mesma cidade."
                  : level === "estado"
                  ? "Alcance amplificado em todo o estado."
                  : "Máximo alcance — sua casa exibida no país inteiro."}
              </p>
              <div className="space-y-2">
                {boostCatalog
                  .filter((b) => b.level === level)
                  .map((p) => (
                    <div key={p.days} className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/40 transition">
                      <div>
                        <div className="font-semibold">{p.days} dias</div>
                        <div className="text-xs text-muted-foreground">Renovação manual</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display font-bold text-lg text-primary">{formatBRL(p.price)}</div>
                      </div>
                      <Button
                        size="sm"
                        className="ml-3"
                        onClick={() => {
                          applyBoost(level, p.days);
                          toast.success(`Casa impulsionada em nível ${level} por ${p.days} dias`);
                        }}
                      >
                        Contratar
                      </Button>
                    </div>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-5 w-5 text-gold" />
          <h2 className="font-display font-bold text-xl">Destaques de marca</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {highlightCatalog.map((h) => (
            <Card key={h.scope} className="p-5 flex flex-col">
              <Badge tone="gold" className="self-start mb-2 capitalize">Destaque {h.scope}</Badge>
              <div className="font-display font-bold text-lg">{h.label}</div>
              <p className="text-xs text-muted-foreground mt-1 flex-1">{h.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="font-display font-bold text-2xl text-primary">{formatBRL(h.price)}</div>
                <Button
                  variant="outline"
                  onClick={() => {
                    applyHighlight(h.scope as any, 15);
                    toast.success(`Destaque ${h.scope} ativado por 15 dias`);
                  }}
                >
                  Ativar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Card className="p-6">
        <h2 className="font-display font-bold text-lg mb-3">Entrega paga da página</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Sua página da casa aparecerá diretamente no feed de usuários com interesses compatíveis.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: "Entrega local", price: 19.9, reach: "500 usuários" },
            { name: "Entrega ampla", price: 59.9, reach: "5 mil usuários" },
            { name: "Entrega massiva", price: 199.9, reach: "50 mil usuários" },
          ].map((e) => (
            <div key={e.name} className="p-4 rounded-xl border border-border">
              <div className="text-sm text-muted-foreground">{e.reach}</div>
              <div className="font-display font-bold text-lg">{e.name}</div>
              <div className="flex items-center justify-between mt-3">
                <div className="font-display font-bold text-primary text-xl">{formatBRL(e.price)}</div>
                <Button size="sm" onClick={() => toast.success(`${e.name} contratada`)}>Contratar</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
