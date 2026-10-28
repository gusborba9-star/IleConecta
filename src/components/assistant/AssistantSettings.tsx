import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";
import type { HouseUser, User } from "@/types";
import { DAYS, PROFILE_MAX, TONE_LABEL, fetchMyAssistant, saveMyAssistant, type AssistantConfig, type HouseProfile, type Tone } from "@/lib/assistant";

/** Configuração da assistente pela casa. Só aparece com conta real de casa. */
export default function AssistantSettings() {
  const { currentUser, isRemoteAuth, updateUser } = useApp();
  const { config } = usePlatformConfig();
  const currentOfferings = (currentUser as HouseUser | null)?.offerings ?? "";
  const [offerings, setOfferings] = useState<string | null>(null);
  const offeringsValue = offerings ?? currentOfferings;
  const [cfg, setCfg] = useState<AssistantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const show = isRemoteAuth && currentUser?.type === "commercial";
  const userId = currentUser?.id;

  useEffect(() => {
    if (!show || !userId) return;
    let alive = true;
    fetchMyAssistant(userId).then((c) => {
      if (!alive) return;
      setCfg(c);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [show, userId]);

  if (!show) return null;
  if (!isFeatureOn(config, "assistant", userId)) {
    return <Card className="p-5 text-sm text-muted-foreground">A assistente virtual ainda não foi liberada para a sua casa.</Card>;
  }
  if (loading) return <Card className="p-5 text-sm text-muted-foreground">Carregando assistente…</Card>;
  if (!cfg) return null;

  const patch = (p: Partial<AssistantConfig>) => setCfg({ ...cfg, ...p });
  const patchProfile = (p: Partial<HouseProfile>) => setCfg({ ...cfg, profile: { ...cfg.profile, ...p } });
  const setFaq = (i: number, field: "q" | "a", value: string) =>
    patchProfile({ faq: cfg.profile.faq.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)) });
  const available = cfg.plan !== "base";
  const fullPlan = cfg.plan === "maximo";

  const save = async () => {
    setSaving(true);
    // "O que a casa faz" é o mesmo texto da página da casa (houses.offerings).
    const okOffer = offeringsValue.trim() === currentOfferings.trim() ? true : await updateUser({ offerings: offeringsValue.trim() } as Partial<User>);
    const ok = (await saveMyAssistant(cfg)) && okOffer;
    setSaving(false);
    if (ok) toast.success("Assistente salva.");
    else toast.error("Não foi possível salvar. Tente novamente.");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h2 className="font-display font-bold text-lg flex-1">Assistente virtual</h2>
        <Badge tone={available ? "primary" : "muted"}>Plano {config.pricing.plans[cfg.plan].name}</Badge>
      </div>

      {!available && (
        <p className="text-sm text-muted-foreground">
          O plano {config.pricing.plans.base.name} não inclui a assistente. Você já pode deixar tudo configurado; ela passa a responder quando o plano for atualizado.
        </p>
      )}
      {cfg.plan === "intermediario" && (
        <p className="text-sm text-muted-foreground">
          No plano {config.pricing.plans.intermediario.name} a assistente informa e orienta (até 300 respostas por mês). Venda pelo chat e descontos são do plano {config.pricing.plans.maximo.name}.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        Assistente ativada para clientes
      </label>

      <div>
        <Label htmlFor="as-name">Nome da assistente</Label>
        <Input id="as-name" maxLength={40} value={cfg.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
      </div>

      <div>
        <Label htmlFor="as-ins">Como ela deve atender</Label>
        <Textarea
          id="as-ins"
          maxLength={2000}
          value={cfg.instructions}
          onChange={(e) => patch({ instructions: e.target.value })}
          placeholder="Tom acolhedor, como funciona a consulta, o que levar, regras da casa…"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Preços e datas vêm dos seus serviços e rituais cadastrados; a assistente não inventa valores.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border/70 p-4">
        <div>
          <h3 className="font-semibold">Conheça a sua casa para a assistente</h3>
          <p className="text-xs text-muted-foreground">Quanto mais você escrever, melhor ela atende. Ela só fala do que está aqui e nos seus serviços e rituais.</p>
        </div>
        <div>
          <Label htmlFor="pf-off">Trabalhos e serviços que a casa realiza</Label>
          <Textarea
            id="pf-off"
            rows={4}
            maxLength={800}
            value={offeringsValue}
            onChange={(e) => setOfferings(e.target.value)}
            placeholder="Ex.: Trabalhos para todos os fins: amor, prosperidade, abertura de caminhos, segurança, limpeza espiritual. Jogo de búzios."
          />
          <p className="text-xs text-muted-foreground mt-1">
            É o mesmo texto da sua página. Mesmo sem nada publicado, a assistente apresenta o que a casa faz e chama você para combinar valores e horários. Ela nunca inventa preço.
          </p>
        </div>
        <div>
          <Label htmlFor="pf-trad">Tradição ou linha da casa</Label>
          <Input id="pf-trad" maxLength={PROFILE_MAX.tradition} value={cfg.profile.tradition} onChange={(e) => patchProfile({ tradition: e.target.value })} placeholder="ex.: Umbanda, Candomblé de Ketu…" />
        </div>
        <div>
          <Label htmlFor="pf-about">Sobre a casa</Label>
          <Textarea id="pf-about" rows={3} maxLength={PROFILE_MAX.about} value={cfg.profile.about} onChange={(e) => patchProfile({ about: e.target.value })} placeholder="História, quem conduz, como é o atendimento…" />
        </div>
        <div>
          <Label htmlFor="pf-tone">Tom da conversa</Label>
          <select id="pf-tone" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cfg.profile.tone} onChange={(e) => patchProfile({ tone: e.target.value as Tone })}>
            {(Object.keys(TONE_LABEL) as Tone[]).map((t) => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="pf-addr">Como chegar e onde fica</Label>
          <Textarea id="pf-addr" rows={2} maxLength={PROFILE_MAX.address} value={cfg.profile.address} onChange={(e) => patchProfile({ address: e.target.value })} placeholder="Endereço, referência, estacionamento, o que levar…" />
        </div>
        <div>
          <Label htmlFor="pf-dont">O que a casa não faz</Label>
          <Textarea id="pf-dont" rows={2} maxLength={PROFILE_MAX.dont} value={cfg.profile.dont} onChange={(e) => patchProfile({ dont: e.target.value })} placeholder="ex.: não faz trabalhos para prejudicar ninguém, não atende menores sozinhos…" />
        </div>
        <div>
          <Label htmlFor="pf-hand">Assuntos que você quer atender pessoalmente</Label>
          <Textarea id="pf-hand" rows={2} maxLength={PROFILE_MAX.handoff} value={cfg.profile.handoff} onChange={(e) => patchProfile({ handoff: e.target.value })} placeholder="Além de luto, crise, saúde e reclamações, que já passam para você." />
        </div>
        <div className="space-y-2">
          <Label>Perguntas frequentes</Label>
          {cfg.profile.faq.map((f, i) => (
            <div key={i} className="space-y-1 rounded-md bg-muted/40 p-2">
              <Input aria-label={`Pergunta ${i + 1}`} maxLength={PROFILE_MAX.faqQ} value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} placeholder="Pergunta" />
              <Textarea aria-label={`Resposta ${i + 1}`} rows={2} maxLength={PROFILE_MAX.faqA} value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} placeholder="Resposta da casa" />
              <Button type="button" size="sm" variant="ghost" onClick={() => patchProfile({ faq: cfg.profile.faq.filter((_, idx) => idx !== i) })}>Remover</Button>
            </div>
          ))}
          {cfg.profile.faq.length < PROFILE_MAX.faq && (
            <Button type="button" size="sm" variant="outline" onClick={() => patchProfile({ faq: [...cfg.profile.faq, { q: "", a: "" }] })}>Adicionar pergunta</Button>
          )}
        </div>
      </div>

      <div>
        <Label>Horário de atendimento</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DAYS.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-20 text-sm text-muted-foreground">{d.label}</span>
              <Input
                aria-label={`Horário de ${d.label}`}
                maxLength={40}
                placeholder="ex.: 9h às 18h"
                value={cfg.businessHours[d.key] ?? ""}
                onChange={(e) => patch({ businessHours: { ...cfg.businessHours, [d.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className={`flex items-center gap-2 text-sm ${fullPlan ? "" : "opacity-50"}`}>
          <input type="checkbox" disabled={!fullPlan} checked={cfg.canSell} onChange={(e) => patch({ canSell: e.target.checked })} />
          Pode ajudar a fechar vendas (pagamento é gerado pelo sistema)
        </label>
        <label className={`flex items-center gap-2 text-sm ${fullPlan ? "" : "opacity-50"}`}>
          <input type="checkbox" disabled={!fullPlan} checked={cfg.canDiscount} onChange={(e) => patch({ canDiscount: e.target.checked })} />
          Pode oferecer desconto, até
          <Input
            aria-label="Desconto máximo em porcentagem"
            type="number"
            min={0}
            max={100}
            disabled={!fullPlan || !cfg.canDiscount}
            className="w-20 h-9"
            value={cfg.maxDiscountPercent}
            onChange={(e) => patch({ maxDiscountPercent: Number(e.target.value) })}
          />
          %
        </label>
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar assistente"}</Button>
    </Card>
  );
}
