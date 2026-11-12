import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/base";
import { INFO_PAGES } from "@/content/institutional";
import { FAQ } from "@/content/faq";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/base";
import ConectaChat from "@/components/support/ConectaChat";
import AccountTools from "@/components/support/AccountTools";
import ReportOccurrence from "@/components/support/ReportOccurrence";
import { useApp } from "@/contexts/AppContext";
import { supportEmail } from "@/lib/support";


export default function Support() {
  const { currentUser, isRemoteAuth } = useApp();
  const [email, setEmail] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  useEffect(() => { void supportEmail().then(setEmail); }, []);
  const live = Boolean(currentUser) && isRemoteAuth;
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Suporte</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Aconteceu algo? Relate a ocorrência e a equipe analisa com os fatos reais da plataforma. Dúvidas comuns estão respondidas abaixo.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {live ? (
            <>
              <Button onClick={() => setReport(true)}>Relatar ocorrência</Button>
              <Link to="/suporte/chamados" className="text-sm font-semibold text-primary hover:underline">Meus chamados</Link>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{currentUser ? "Os chamados funcionam na versão com contas reais." : "Entre na sua conta para relatar uma ocorrência."}</p>
          )}
          {email && <span className="text-sm">Ou escreva para <a className="text-primary font-semibold hover:underline" href={`mailto:${email}`}>{email}</a></span>}
        </div>
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
      {live && <ConectaChat />}
      {live && <AccountTools />}
      <ReportOccurrence open={report} onClose={() => setReport(false)} />
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
