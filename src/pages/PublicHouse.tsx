import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CheckCircle2, MapPin, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchPublicHouse, publicHouseUrl, type PublicHouse } from "@/lib/publicHouse";
import { formatCents } from "@/lib/servicesCore";
import { fetchHouseCalendar, type CalendarItem } from "@/lib/calendar";
import { daysUntil, formatDay, kindLabel, todayLocal, upcoming, whenLabel } from "@/lib/calendarCore";

/** Página aberta a qualquer pessoa (sem login): é o que o link e o QR code da casa mostram. */
export default function PublicHousePage() {
  const { slug = "" } = useParams();
  const { currentUser } = useApp();
  const [house, setHouse] = useState<PublicHouse | null | undefined>(undefined);
  const [dates, setDates] = useState<CalendarItem[]>([]);

  useEffect(() => {
    let alive = true;
    setHouse(undefined);
    void fetchPublicHouse(slug).then((h) => alive && setHouse(h));
    return () => {
      alive = false;
    };
  }, [slug]);

  // Datas públicas (só aparecem se o calendário estiver ligado e a casa tiver marcado como públicas).
  useEffect(() => {
    if (!house) return;
    let alive = true;
    void fetchHouseCalendar(house.ownerId).then((c) => alive && setDates(c.items));
    return () => {
      alive = false;
    };
  }, [house]);

  useEffect(() => {
    if (!house) return;
    const previous = document.title;
    document.title = `${house.name} · Ilê Conecta`;
    return () => {
      document.title = previous;
    };
  }, [house]);

  if (house === undefined) return <p className="text-center text-muted-foreground py-16">Carregando…</p>;
  if (house === null)
    return (
      <Card className="p-8 text-center">
        <div className="font-display text-2xl">Casa não encontrada</div>
        <p className="text-sm text-muted-foreground mt-1">Confira o endereço do link ou procure a casa dentro do Ilê Conecta.</p>
        <Link to="/login" className="inline-block mt-4 text-primary font-semibold hover:underline">Entrar no Ilê Conecta</Link>
      </Card>
    );
  // Quem já está logado segue para a página completa da casa.
  if (currentUser) return <Navigate to={`/casa/${house.ownerId}`} replace />;

  const place = [house.city, house.state].filter(Boolean).join(", ");
  const share = async () => {
    const url = publicHouseUrl(house.slug);
    try {
      if (navigator.share) await navigator.share({ title: house.name, text: `Conheça a casa ${house.name} no Ilê Conecta`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado.");
      }
    } catch {
      /* compartilhar cancelado */
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="relative h-40 sm:h-52 bg-gradient-to-br from-primary/30 via-gold/20 to-forest/30">
          {house.cover && <img src={house.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <div className="px-4 sm:px-6 pb-5">
          <div className="relative z-10 -mt-12 w-fit rounded-full p-1.5 bg-card shadow-card">
            <Avatar src={house.avatar ?? `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(house.name)}`} name={house.name} size={96} className="ring-2 ring-gold" />
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-2xl md:text-3xl leading-tight">{house.name}</h1>
            {house.verified && <Badge tone="primary"><CheckCircle2 className="h-3 w-3" /> Verificada</Badge>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-x-3 gap-y-1 flex-wrap mt-1">
            {place && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {place}</span>}
            <span>{house.category}</span>
          </div>
          {house.bio && <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">{house.bio}</p>}
          {house.offerings && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Trabalhos que a casa realiza</div>
              <p className="mt-1 text-sm whitespace-pre-line">{house.offerings}</p>
            </div>
          )}
          {house.tags.length > 0 && <div className="flex gap-1.5 mt-3 flex-wrap">{house.tags.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}</div>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/login" state={{ from: `/casa/${house.ownerId}` }}><Button>Falar com a casa</Button></Link>
            <Link to="/register"><Button variant="outline">Cadastrar conta</Button></Link>
            <Button variant="ghost" onClick={() => void share()}><Share2 className="h-4 w-4" /> Compartilhar</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Para conversar com a casa, entre na sua conta ou cadastre-se (é grátis).</p>
        </div>
      </Card>

      {(() => {
        const today = todayLocal();
        const next = upcoming(dates, today).filter((d) => d.next).slice(0, 5);
        if (next.length === 0) return null;
        return (
          <Card className="p-5">
            <h2 className="font-display font-bold text-lg mb-3">Próximas datas da casa</h2>
            <ul className="divide-y divide-border">
              {next.map((d) => {
                const days = d.next ? daysUntil(d.next, today) : null;
                return (
                  <li key={d.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-[200px] flex-1">
                      <div className="font-semibold">{d.title} <Badge tone="muted" className="ml-1">{kindLabel(d.kind)}</Badge></div>
                      {d.note && <p className="text-sm text-muted-foreground mt-1">{d.note}</p>}
                    </div>
                    <div className="text-sm text-muted-foreground">{formatDay(d.next ?? d.date, !d.yearly)}{days !== null && days <= 60 ? ` · ${whenLabel(days)}` : ""}</div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })()}

      {house.services.length > 0 && (
        <Card className="p-5">
          <h2 className="font-display font-bold text-lg mb-3">Serviços</h2>
          <ul className="divide-y divide-border">
            {house.services.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="font-semibold">{s.title} <Badge tone="gold" className="ml-1">{s.kind}</Badge></div>
                  {s.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{s.description}</p>}
                </div>
                <div className="font-display font-bold text-lg">{formatCents(s.priceCents)}</div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">Para contratar, entre na sua conta ou crie uma gratuitamente.</p>
        </Card>
      )}
    </div>
  );
}
