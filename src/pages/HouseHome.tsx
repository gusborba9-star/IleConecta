import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Circle, Megaphone, Newspaper, Plus, Sparkles, TrendingUp } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchServices } from "@/lib/services";
import type { HouseUser } from "@/types";

const hasOwnPhoto = (url: string) => Boolean(url) && !url.includes("dicebear.com");
const hasOwnCover = (url: string) => Boolean(url) && !url.includes("photo-1502786129293");

/** Página inicial da conta de casa: o que fazer agora, e não o feed da comunidade. */
export default function HouseHome() {
  const { currentUser } = useApp();
  const nav = useNavigate();
  const house = currentUser?.type === "commercial" ? (currentUser as HouseUser) : null;
  const [serviceCount, setServiceCount] = useState<number | null>(null);
  const houseId = house?.id;

  useEffect(() => {
    if (!houseId) return;
    let alive = true;
    fetchServices(houseId).then((s) => alive && setServiceCount(s.length));
    return () => {
      alive = false;
    };
  }, [houseId]);

  if (!house) return null;

  const steps = [
    { done: hasOwnPhoto(house.avatar), label: "Adicione a foto da casa", to: `/casa/${house.id}?editar=1` },
    { done: hasOwnCover(house.cover), label: "Escolha uma capa", to: `/casa/${house.id}?editar=1` },
    { done: Boolean(house.bio?.trim()), label: "Escreva a apresentação da casa", to: `/casa/${house.id}?editar=1` },
    { done: (serviceCount ?? 0) > 0, label: "Cadastre o primeiro serviço", to: `/casa/${house.id}?aba=servicos&novo=1` },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  const tiles = [
    { icon: Plus, title: "Novo serviço", text: "Búzios, cartas, trabalhos, consultas", onClick: () => nav(`/casa/${house.id}?aba=servicos&novo=1`) },
    { icon: Sparkles, title: "Novo ritual", text: "Evento coletivo com vagas (em breve)", disabled: true },
    { icon: Newspaper, title: "Publicar", text: "Texto e foto para a comunidade", onClick: () => nav("/comunidade") },
    { icon: TrendingUp, title: "Divulgar a casa", text: "Impulsionar ou destacar", onClick: () => nav("/impulsionar") },
  ];

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40">
        <h1 className="font-display font-bold text-2xl">Olá, {house.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Aqui está o que você pode fazer pela sua casa hoje.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => nav(`/casa/${house.id}`)}>Ver minha página</Button>
          <Button variant="outline" onClick={() => nav("/comunidade")}>Ir para a comunidade</Button>
        </div>
      </Card>

      <section aria-label="Atalhos" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {tiles.map((t) => (
          <button
            key={t.title}
            type="button"
            disabled={t.disabled}
            onClick={t.onClick}
            className="text-left rounded-2xl border border-border bg-card p-4 min-h-24 transition hover:bg-muted disabled:opacity-60 disabled:pointer-events-none"
          >
            <span className="flex items-center gap-2 font-semibold"><t.icon className="h-4 w-4 text-primary" />{t.title}</span>
            <span className="block text-sm text-muted-foreground mt-1">{t.text}</span>
          </button>
        ))}
      </section>

      {remaining > 0 && (
        <Card className="p-5">
          <h2 className="font-display font-bold text-lg">Complete a sua página</h2>
          <p className="text-sm text-muted-foreground">Faltam {remaining} {remaining === 1 ? "passo" : "passos"} para a casa causar uma boa primeira impressão.</p>
          <ul className="mt-3 space-y-1">
            {steps.map((s) => (
              <li key={s.label}>
                <Link to={s.to} className="flex items-center gap-3 rounded-xl px-2 min-h-11 hover:bg-muted">
                  {s.done ? <Check className="h-5 w-5 text-forest" aria-hidden /> : <Circle className="h-5 w-5 text-muted-foreground" aria-hidden />}
                  <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /><h2 className="font-display font-bold text-lg">Assistente virtual</h2></div>
        <p className="text-sm text-muted-foreground mt-1">Configure como a assistente atende os seus clientes.</p>
        <Link to="/perfil" className="inline-block mt-2 text-sm font-semibold text-primary">Configurar assistente</Link>
      </Card>
    </div>
  );
}
