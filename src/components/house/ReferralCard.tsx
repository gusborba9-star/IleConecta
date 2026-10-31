import { useEffect, useState } from "react";
import { Gift, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchMyReferral, referralLink, type MyReferral } from "@/lib/referral";

const STATUS: Record<string, { label: string; tone: "gold" | "muted" | "forest" }> = {
  pendente: { label: "Aguardando o primeiro acesso", tone: "muted" },
  concedido: { label: "Prêmio liberado", tone: "forest" },
  recusado: { label: "Sem prêmio", tone: "muted" },
};
const REASON: Record<string, string> = {
  limite_mensal: "limite do mês atingido",
  programa_desligado: "programa estava desligado",
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Indique e ganhe: a casa convida outra casa e, quando ela entra pela primeira vez, ganha dias de destaque. Só aparece com o programa ligado no admin. */
export default function ReferralCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const uid = currentUser?.id;
  const [r, setR] = useState<MyReferral | null>(null);

  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    let alive = true;
    void fetchMyReferral().then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid]);

  if (!isRemoteAuth || !uid || !r || !r.enabled) return null;

  const link = referralLink(r.code);
  const message = `Conheça o Ilê Conecta, a rede das casas de religião afro. Crie a conta da sua casa por este convite: ${link}`;
  const active = r.activeUntil && new Date(r.activeUntil).getTime() > Date.now() ? r.activeUntil : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Ilê Conecta", text: message });
        return;
      } catch {
        return; // pessoa cancelou
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="p-5 space-y-3 border-gold/40">
      <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-gold" /><h2 className="font-display font-bold text-lg">Indique e ganhe</h2></div>
      <p className="text-sm text-muted-foreground">
        Convide outra casa. Quando ela criar a conta e entrar pela primeira vez, sua casa ganha <strong className="text-foreground">{r.rewardDays} {r.rewardDays === 1 ? "dia" : "dias"} em destaque</strong> na lista de casas
        {r.referredDays > 0 ? `, e a casa convidada ganha ${r.referredDays} ${r.referredDays === 1 ? "dia" : "dias"}` : ""}. Limite de {r.monthlyCap} {r.monthlyCap === 1 ? "prêmio" : "prêmios"} por mês.
      </p>
      {active && <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">Sua casa está em destaque até <strong>{fmtDate(active)}</strong>.</div>}
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-muted px-3 py-2 text-xs break-all flex-1 min-w-[220px]">{link}</code>
        <Button variant="outline" size="sm" onClick={() => void copy()}><Copy className="h-4 w-4" /> Copiar</Button>
        <Button size="sm" onClick={() => void share()}><Share2 className="h-4 w-4" /> Compartilhar</Button>
      </div>
      <p className="text-xs text-muted-foreground">Seu código: <span className="font-semibold text-foreground">{r.code}</span> · Prêmios neste mês: {r.grantedThisMonth} de {r.monthlyCap}</p>
      {r.items.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {r.items.map((i, k) => (
            <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-semibold flex-1 min-w-0 truncate">{i.name}</span>
              <Badge tone={STATUS[i.status]?.tone ?? "muted"}>{STATUS[i.status]?.label ?? i.status}</Badge>
              <span className="text-xs text-muted-foreground">{fmtDate(i.at)}{i.reason && REASON[i.reason] ? ` · ${REASON[i.reason]}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
