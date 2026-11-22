import { Link } from "react-router-dom";
import { Compass, Sparkles } from "lucide-react";
import { Card } from "@/components/base";

/** Boas-vindas do cliente que ainda não segue nem tem vínculo com nenhuma casa: o que ele pode fazer aqui, com o caminho direto. */
export default function WelcomeClient({ name }: { name?: string }) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return (
    <Card className="overflow-hidden border-gold/40">
      <div className="border-l-4 border-l-gold p-4">
        <h2 className="text-base font-semibold">{first ? `Bem-vindo, ${first}` : "Bem-vindo ao Ilê Conecta"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Encontre sua casa, conecte-se com quem orienta e viva cada etapa da sua jornada com acolhimento e segurança. Tudo no Ilê Conecta.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/descobrir" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-cta transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Compass className="h-4 w-4" aria-hidden /> Descobrir casas
          </Link>
          <Link to="/rituais" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Sparkles className="h-4 w-4" aria-hidden /> Ver rituais
          </Link>
        </div>
      </div>
    </Card>
  );
}
