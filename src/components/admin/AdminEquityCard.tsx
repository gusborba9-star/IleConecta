import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/base";
import { supabase } from "@/lib/supabase";
import { describeEquity, readEquity, type EquityGroup } from "@/lib/promoEquityCore.js";

const PERIODS = [7, 30, 90];

/** Equilíbrio da divulgação por alcance (só administração, só leitura). Exposição = visualizações ÷ dias em que a campanha esteve ativa e elegível. Não altera o sorteio. */
export default function AdminEquityCard() {
  const [days, setDays] = useState(30);
  const [groups, setGroups] = useState<EquityGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    if (!supabase) return;
    const { data, error: e } = await supabase.rpc("admin_promo_equity", { p_days: d });
    if (e) return void setError(/not_admin/.test(e.message ?? "") ? "hidden" : "Não foi possível carregar o equilíbrio da divulgação.");
    setError(null);
    setGroups(readEquity(data));
  }, []);
  useEffect(() => { void load(days); }, [days, load]);

  if (error === "hidden" || !supabase) return null;
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg">Equilíbrio da divulgação</h2>
        <p className="text-xs text-muted-foreground">Só leitura: mostra como o sorteio atual distribuiu a exposição entre as casas. Exposição = visualizações ÷ dias em que a campanha esteve ativa e elegível no alcance. Não há limite de «equilíbrio»: observe a distribuição e a mudança ao longo das semanas.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Período do equilíbrio">
        {PERIODS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={days === p} onClick={() => setDays(p)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${days === p ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>{p} dias</button>
        ))}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
        : groups === null ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : groups.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma campanha com dias ativos neste período.</p>
        : groups.map((g) => (
          <section key={g.group} aria-label={`${g.scope} ${g.place}`} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{g.scope} · {g.place}</h3>
            <p className="text-sm">{describeEquity(g)}</p>
            <ul className="space-y-1.5">
              {g.items.map((i) => (
                <li key={i.houseId} className="rounded-xl border border-border p-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2"><span className="min-w-0 break-words font-semibold">{i.name}</span><span className="shrink-0 text-xs text-muted-foreground">{String(i.share).replace(".", ",")}% das visualizações</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, i.share)}%` }} /></div>
                  <div className="mt-1 text-xs text-muted-foreground">{i.views} {i.views === 1 ? "visualização" : "visualizações"} em {i.activeDays} {i.activeDays === 1 ? "dia ativo" : "dias ativos"} · {String(i.exposure).replace(".", ",")} por dia</div>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </Card>
  );
}
