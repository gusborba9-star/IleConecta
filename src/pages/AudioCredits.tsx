import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Music } from "lucide-react";
import { Card } from "@/components/base";
import { fetchMusicCredits } from "@/lib/moments";
import type { MusicCredit } from "@/lib/momentsCore";

/** Créditos de áudio: título, autor, fonte e licença de cada música oferecida nos Momentos (atribuição das licenças abertas). */
export default function AudioCredits() {
  const [list, setList] = useState<MusicCredit[] | null>(null);
  useEffect(() => { let alive = true; void fetchMusicCredits().then((c) => { if (alive) setList(c); }); return () => { alive = false; }; }, []);
  return (
    <div className="space-y-5 pb-16 lg:pb-4">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1"><Music className="h-5 w-5 text-primary" aria-hidden /><h1 className="font-display font-bold text-2xl">Créditos de áudio</h1></div>
        <p className="text-sm text-muted-foreground max-w-2xl">O Ilê Conecta oferece, dentro dos Momentos, uma biblioteca de músicas sob licenças abertas (como CC0 e CC BY). Cada faixa mantém sua licença original, devendo ser observados seus respectivos termos. A plataforma pode retirar ou substituir qualquer faixa a qualquer momento.</p>
      </Card>
      <Card className="p-5">
        {list === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {list !== null && list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma música disponível no momento.</p>}
        {list !== null && list.length > 0 && (
          <ul className="divide-y divide-border/60" data-testid="audio-credits">
            {list.map((t, i) => (
              <li key={`${t.title}-${i}`} className="py-3 text-sm">
                <div className="font-semibold">{t.title} <span className="font-normal text-muted-foreground">— {t.author}</span></div>
                <div className="text-xs text-muted-foreground mt-0.5 break-words">
                  {t.license && <span>Licença: {t.licenseUrl ? <a href={t.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{t.license}</a> : t.license}</span>}
                  {t.source && <>{t.license ? " · " : ""}<a href={t.source} target="_blank" rel="noopener noreferrer" className="underline">Fonte</a></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm"><Link to="/termos" className="text-primary hover:underline">Voltar para Termos e normas</Link></p>
    </div>
  );
}
