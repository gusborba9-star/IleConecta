import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card, Progress } from "@/components/base";
import { formatBRL } from "@/lib/utils";
import { CalendarDays, MapPin, MessageCircle, ShieldCheck, Sparkles, Ticket, Video } from "lucide-react";
import RitualPurchaseModal from "@/components/ritual/RitualPurchaseModal";

export default function RitualDetail() {
  const { id } = useParams();
  const { rituals, getHouse, currentUser } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ritual = rituals.find((r) => r.id === id);
  if (!ritual) return <div className="p-8 text-center">Ritual não encontrado</div>;
  const house = getHouse(ritual.houseId);
  const remaining = ritual.vagasTotal - ritual.vagasVendidas;
  const pct = (ritual.vagasVendidas / ritual.vagasTotal) * 100;
  const soldOut = remaining <= 0;
  const isClient = currentUser?.type === "personal";

  return (
    <div className="pb-16 lg:pb-4 space-y-4">
      <Card className="overflow-hidden">
        <div className="relative h-64 md:h-96">
          <img src={ritual.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white">
            <div className="flex gap-2 mb-2">
              <Badge tone="gold">Ritual</Badge>
              <Badge tone={ritual.mode === "distancia" ? "forest" : "primary"} className="capitalize">
                {ritual.mode === "presencial" ? <><MapPin className="h-3 w-3" /> Presencial</> : ritual.mode === "distancia" ? <><Video className="h-3 w-3" /> À distância</> : "Híbrido"}
              </Badge>
            </div>
            <h1 className="font-display font-bold text-3xl md:text-4xl max-w-3xl">{ritual.title}</h1>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar src={house?.avatar} name={house?.name} size={48} ring="gold" />
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Casa responsável</div>
                <button onClick={() => nav(`/casa/${house?.id}`)} className="font-display font-bold text-lg hover:underline">{house?.name}</button>
              </div>
            </div>
            <p className="text-[15px] leading-relaxed">{ritual.description}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <MiniStat icon={CalendarDays} label="Início" value={new Date(ritual.date).toLocaleDateString("pt-BR")} />
              <MiniStat icon={Ticket} label="Vagas restantes" value={String(remaining)} />
              <MiniStat icon={Sparkles} label="Modalidade" value={ritual.mode === "distancia" ? "À distância" : ritual.mode === "presencial" ? "Presencial" : "Híbrido"} />
              <MiniStat icon={ShieldCheck} label="Categoria" value={ritual.category} />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-display font-bold text-lg mb-3">O que está incluso</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {[
                "Consulta inicial pelo chat",
                "Materiais e oferendas fornecidos pela casa",
                "Certificado espiritual digital",
                "Suporte pós-ritual por 7 dias",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" /> {x}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6 sticky top-24">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Valor da vaga</div>
            <div className="font-display font-bold text-4xl text-primary mt-1">{formatBRL(ritual.price)}</div>
            <div className="text-xs text-muted-foreground">Pagamento único · à vista ou parcelado</div>

            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{ritual.vagasVendidas} confirmadas</span>
                <span className={remaining < 20 ? "text-primary font-semibold" : "text-muted-foreground"}>{remaining} vagas</span>
              </div>
              <Progress value={pct} tone={pct > 85 ? "primary" : "gold"} />
            </div>

            {isClient ? (
              <Button className="w-full mt-4" size="lg" disabled={soldOut} onClick={() => setOpen(true)}>
                {soldOut ? "Ritual esgotado" : "Contratar agora"}
              </Button>
            ) : currentUser?.id === house?.id ? (
              <Button className="w-full mt-4" size="lg" variant="outline" onClick={() => nav("/impulsionar")}>
                Impulsionar este ritual
              </Button>
            ) : (
              <Button className="w-full mt-4" size="lg" variant="outline" onClick={() => nav(`/casa/${house?.id}`)}>
                Visitar a casa
              </Button>
            )}
            <Button
              className="w-full mt-2"
              variant="ghost"
              onClick={() => nav(`/mensagens/${house?.id}`)}
            >
              <MessageCircle className="h-4 w-4" /> Falar com a casa
            </Button>

            <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-forest mt-0.5" />
              Pagamento processado pela plataforma. A casa recebe automaticamente após a confirmação, já com a taxa da plataforma descontada.
            </div>
          </Card>
        </div>
      </div>

      <RitualPurchaseModal ritual={ritual} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: any) {
  return (
    <div className="p-3 rounded-xl bg-muted/60 border border-border">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-semibold mt-1 truncate">{value}</div>
    </div>
  );
}
