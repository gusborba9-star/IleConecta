import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { useApp } from "@/contexts/AppContext";
import { fetchConsentRows, recordConsents, withdrawSensitiveConsent } from "@/lib/consents";
import { LEGAL_VERSION, OPTIONAL_DOCS, REQUIRED_DOCS, consentStatus, type ConsentDocKey, type ConsentRow } from "@/lib/legalCore";
import { INFO_PAGES } from "@/content/institutional";

const DOC_LABEL: Record<ConsentDocKey, { title: string; slug: string }> = {
  termos_cliente: { title: "Termos de Uso do cliente e Política de Privacidade", slug: "termos-do-cliente" },
  termos_casa: { title: "Termos de Uso da Casa Espiritual", slug: "termos-da-casa" },
  dados_sensiveis: { title: "Autorização para dados sobre convicção religiosa", slug: "privacidade-lgpd" },
};

const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Termos e privacidade", slugs: ["termos-do-cliente", "termos-da-casa", "privacidade-lgpd", "eventos-e-taxas"] },
  { title: "Normas da comunidade", slugs: ["normas-de-uso", "conduta"] },
  { title: "Sobre o Ilê Conecta", slugs: ["quem-somos", "visao"] },
];

const dateBr = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

/** Termos e normas: tudo o que a pessoa aceitou (com data e versão) e os textos completos, sempre à mão, para cliente, casa e equipe. */
export default function Terms() {
  const { currentUser, isRemoteAuth } = useApp();
  const confirm = useConfirm();
  const userId = currentUser?.id;
  const [rows, setRows] = useState<ConsentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const isHouse = currentUser?.type === "commercial";
  const key = isHouse ? "casa" : "cliente";
  const docs: ConsentDocKey[] = [...REQUIRED_DOCS[key], ...OPTIONAL_DOCS[key]];

  const load = useCallback(async () => {
    if (isRemoteAuth && userId) setRows(await fetchConsentRows(userId));
  }, [isRemoteAuth, userId]);
  useEffect(() => {
    void load();
  }, [load]);

  const withdraw = async () => {
    const ok = await confirm({
      title: "Retirar a autorização?",
      message: "Você continua usando a plataforma, mas só poderá contratar de novo depois de autorizar outra vez.",
      confirmLabel: "Retirar",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const error = await withdrawSensitiveConsent();
    setBusy(false);
    if (error) return void toast.error(error);
    toast.success("Autorização retirada.");
    await load();
  };

  const authorize = async (doc: ConsentDocKey) => {
    setBusy(true);
    const error = await recordConsents([doc]);
    setBusy(false);
    if (error) return void toast.error(error);
    toast.success(doc === "dados_sensiveis" ? "Autorização registrada." : "Termos aceitos.");
    await load();
  };

  return (
    <div className="space-y-5 pb-16 lg:pb-4">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Termos e normas</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">Os textos completos e o que você aceitou, sempre aqui. O aceite é feito uma única vez e só é pedido de novo se um texto mudar.</p>
      </Card>

      {isRemoteAuth && (
        <Card className="p-5">
          <h2 className="font-display font-bold text-lg mb-3">O que você aceitou</h2>
          {rows === null ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="space-y-3">
              {docs.map((d) => {
                const st = consentStatus(rows, d, LEGAL_VERSION);
                const sensitive = d === "dados_sensiveis";
                return (
                  <div key={d} className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                    <div className="min-w-[200px] flex-1">
                      <Link to={`/sobre/${DOC_LABEL[d].slug}`} className="font-semibold text-primary hover:underline">{DOC_LABEL[d].title}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {st.status === "ok" && <><Badge tone="forest">Aceito</Badge><span>em {dateBr(st.at)} · versão {st.version}</span></>}
                        {st.status === "old" && <><Badge tone="gold">Há versão nova</Badge><span>aceito em {dateBr(st.at)} · versão {st.version}</span></>}
                        {st.status === "withdrawn" && <><Badge tone="muted">Retirada</Badge><span>em {dateBr(st.at)}</span></>}
                        {st.status === "never" && <Badge tone="muted">{sensitive ? "Ainda não autorizado" : "Ainda não aceito"}</Badge>}
                      </div>
                      {sensitive && <p className="text-xs text-muted-foreground mt-1">Opcional. Só é necessária para contratar e conversar com a casa sobre o seu caso. Você pode retirar quando quiser.</p>}
                    </div>
                    {sensitive && (st.status === "ok" || st.status === "old") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void withdraw()}>Retirar autorização</Button>}
                    {sensitive && (st.status === "withdrawn" || st.status === "never") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void authorize(d)}>Autorizar</Button>}
                    {!sensitive && (st.status === "never" || st.status === "old") && <Button size="sm" disabled={busy} onClick={() => void authorize(d)}>Aceitar</Button>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {GROUPS.map((g) => {
        const pages = g.slugs.map((s) => INFO_PAGES.find((p) => p.slug === s)).filter((p) => p !== undefined);
        return (
          <Card key={g.title} className="p-5">
            <h2 className="font-display font-bold text-lg mb-2">{g.title}</h2>
            <ul className="divide-y divide-border/60">
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link to={`/sobre/${p.slug}`} className="block py-2.5 hover:bg-muted/50 rounded-lg px-2 -mx-2">
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm text-muted-foreground">{p.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
