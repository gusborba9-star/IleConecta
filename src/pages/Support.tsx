import { Link } from "react-router-dom";
import { Card } from "@/components/base";
import { INFO_PAGES } from "@/content/institutional";
import { LifeBuoy } from "lucide-react";

const FAQ = [
  { q: "Como mudo o plano da minha casa?", a: "Veja os planos em Planos. Por enquanto a troca de plano é feita com a equipe da plataforma." },
  { q: "Quando a casa recebe o valor de um evento?", a: "O pagamento do cliente vai direto para a conta de pagamento da casa, sem retenção pela plataforma. A tarifa do Stripe é cobrada da casa." },
  { q: "Qual é a taxa da plataforma?", a: "15% sobre vagas de rituais e 4% sobre serviços contratados pela plataforma. Atendimentos combinados direto com a casa não têm taxa." },
  { q: "A assistente virtual pode errar?", a: "Ela usa apenas os serviços, valores e horários cadastrados pela casa e avisa quando precisa confirmar algo. Em caso de dúvida, fale direto com a casa." },
];

export default function Support() {
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Suporte</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Em breve, o atendimento do suporte será feito primeiro por uma assistente virtual que conhece a plataforma e as regras. Enquanto isso, veja as respostas abaixo.
        </p>
      </Card>
      <Card className="p-6 space-y-4">
        <h2 className="font-display font-bold text-lg">Perguntas frequentes</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <div className="font-semibold text-sm">{f.q}</div>
            <p className="text-sm text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </Card>
      <Card className="p-6">
        <h2 className="font-display font-bold text-lg mb-2">Regras e informações</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {INFO_PAGES.map((p) => (
            <Link key={p.slug} to={`/sobre/${p.slug}`} className="text-primary hover:underline">{p.title}</Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
