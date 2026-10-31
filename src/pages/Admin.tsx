import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import {
  FEATURE_KEYS,
  FEATURE_STATES,
  PLAN_IDS,
  SCOPE_KEYS,
  fetchAdminMetrics,
  fetchAudit,
  fetchHousesForBeta,
  saveSetting,
  type AdminMetrics,
  type AuditRow,
  type FeatureKey,
  type FeatureState,
  type PlatformConfig,
  type ScopeKey,
} from "@/lib/platformConfig";
import PaymentLimitCard from "@/components/admin/PaymentLimitCard";
import ChatReportsCard from "@/components/admin/ChatReportsCard";
import HousePlansCard from "@/components/admin/HousePlansCard";
import { SCOPE_LABEL } from "@/lib/pricing";
import MoneyInput from "@/components/base/MoneyInput";
import { centsToMasked, maskedToCents } from "@/lib/moneyMask";

const FEATURE_LABEL: Record<FeatureKey, string> = {
  assistant: "Assistente virtual",
  boost: "Impulsionar",
  highlight: "Destaques nos feeds",
  payments: "Pagamentos pela plataforma (Stripe)",
  ritual_video: "Vídeo de 30 s nos registros do ritual (só casas Premium)",
  referral: "Indique e ganhe entre casas (prêmio em dias de destaque)",
};
const STATE_LABEL: Record<FeatureState, string> = { off: "Desligado", beta: "Teste (casas escolhidas)", on: "Ligado para todos" };
const SETTING_LABEL: Record<string, string> = { features: "Funcionalidades", pricing: "Preços", scopes: "Alcance por região", house_plan: "Plano de casa", payment_limits: "Teto por pagamento", referral: "Indique e ganhe" };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export type AdminSection = "visao" | "config" | "historico";

export default function Admin({ section = "visao" }: { section?: AdminSection }) {
  const { isRemoteAuth } = useApp();
  const { config, isAdmin, reload } = usePlatformConfig();
  const [draft, setDraft] = useState<PlatformConfig>(() => clone(config));
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [houses, setHouses] = useState<{ owner_id: string; name: string }[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => setDraft(clone(config)), [config]);

  const load = useCallback(async () => {
    const [m, a, h] = await Promise.all([fetchAdminMetrics(), fetchAudit(), fetchHousesForBeta()]);
    setMetrics(m);
    setAudit(a);
    setHouses(h);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isRemoteAuth) return <Card className="p-8 text-center text-muted-foreground">O painel funciona só com conta real.</Card>;
  if (!isAdmin) return <Card className="p-8 text-center text-muted-foreground">Área restrita à administração.</Card>;

  const save = async (key: "features" | "pricing" | "scopes" | "referral") => {
    setSaving(key);
    const ok = await saveSetting(key, draft[key]);
    setSaving(null);
    if (ok) {
      toast.success(`${SETTING_LABEL[key]} salvo.`);
      await reload();
      void load();
    } else toast.error("Não foi possível salvar.");
  };

  // O campo guarda reais (número) e mostra "1.200,50"; vazio = sem preço.
  const toText = (reais: number | null | undefined) => (reais == null ? "" : centsToMasked(Math.round(reais * 100)));
  const num = (masked: string): number | null => {
    const cents = maskedToCents(masked);
    return cents === null ? null : cents / 100;
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      {section === "visao" && <Card className="p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="font-display font-bold text-2xl">Painel administrativo</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">As mudanças valem na hora, sem deploy. Tudo fica registrado no histórico.</p>
      </Card>}

      {section === "visao" && <Card className="p-5">
        <h2 className="font-display font-bold text-lg mb-3">Métricas</h2>
        {!metrics ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Contas" value={metrics.users_total} />
              <Stat label="Casas" value={metrics.houses_total} />
              <Stat label="Clientes" value={metrics.clients_total} />
              <Stat label="Respostas da assistente (mês)" value={metrics.assistant_month.replies} />
            </div>
            <div className="text-xs text-muted-foreground">
              Casas por plano: {Object.entries(metrics.houses_by_plan).map(([p, n]) => `${config.pricing.plans[p as keyof typeof config.pricing.plans]?.name ?? p}: ${n}`).join(" · ") || "nenhuma"}
              {" · "}Tokens da assistente no mês: {metrics.assistant_month.prompt_tokens.toLocaleString("pt-BR")} entrada, {metrics.assistant_month.completion_tokens.toLocaleString("pt-BR")} saída
            </div>
            <div>
              <div className="text-sm font-semibold mb-1">Cadastros nos últimos 30 dias</div>
              <div className="text-sm text-muted-foreground">
                {metrics.signups_30d.length === 0 ? "Nenhum." : metrics.signups_30d.map((s) => `${new Date(s.day + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: ${s.n}`).join(" · ")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1">Onde estão os usuários</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">País</th><th className="pr-3">Estado</th><th className="pr-3">Cidade</th><th className="pr-3">Contas</th><th>Casas</th></tr></thead>
                  <tbody>
                    {metrics.by_city.map((r, i) => (
                      <tr key={i} className="border-t border-border"><td className="py-1 pr-3">{r.country}</td><td className="pr-3">{r.state}</td><td className="pr-3">{r.city}</td><td className="pr-3">{r.users}</td><td>{r.houses}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>}

      {section === "config" && <>
      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Funcionalidades</h2>
        {FEATURE_KEYS.map((k) => {
          const f = draft.features[k];
          return (
            <div key={k} className="border border-border rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold flex-1">{FEATURE_LABEL[k]}</span>
                <select
                  aria-label={`Estado de ${FEATURE_LABEL[k]}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={f.state}
                  onChange={(e) => setDraft({ ...draft, features: { ...draft.features, [k]: { ...f, state: e.target.value as FeatureState } } })}
                >
                  {FEATURE_STATES.filter((s) => k !== "referral" || s !== "beta").map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
                </select>
              </div>
              {f.state === "beta" && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {houses.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma casa cadastrada.</span>}
                  {houses.map((h) => (
                    <label key={h.owner_id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={f.beta_houses.includes(h.owner_id)}
                        onChange={(e) => {
                          const list = e.target.checked ? [...f.beta_houses, h.owner_id] : f.beta_houses.filter((x) => x !== h.owner_id);
                          setDraft({ ...draft, features: { ...draft.features, [k]: { ...f, beta_houses: list } } });
                        }}
                      />
                      {h.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <Button onClick={() => save("features")} disabled={saving !== null}>{saving === "features" ? "Salvando…" : "Salvar funcionalidades"}</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Indique e ganhe</h2>
        <p className="text-sm text-muted-foreground">Quando uma casa convidada cria a conta e entra pela primeira vez, a casa que indicou ganha dias de destaque na lista de casas. Só funciona com a funcionalidade acima em "Ligado para todos".</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {([
            ["reward_days", "Dias de destaque para quem indica", 1],
            ["referred_days", "Dias de destaque para a casa convidada (0 = nenhum)", 0],
            ["monthly_cap", "Máximo de prêmios por casa, por mês", 1],
          ] as const).map(([key, label, min]) => (
            <div key={key}>
              <Label htmlFor={`ref-${key}`}>{label}</Label>
              <Input id={`ref-${key}`} type="number" min={min} max={key === "monthly_cap" ? 100 : 90} value={draft.referral[key]}
                onChange={(e) => setDraft({ ...draft, referral: { ...draft.referral, [key]: Math.trunc(Number(e.target.value)) || 0 } })} />
            </div>
          ))}
        </div>
        <Button onClick={() => save("referral")} disabled={saving !== null}>{saving === "referral" ? "Salvando…" : "Salvar Indique e ganhe"}</Button>
      </Card>

      <HousePlansCard />

      <ChatReportsCard />

      <PaymentLimitCard />

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Alcance por região</h2>
        <p className="text-sm text-muted-foreground">Uma região só aparece para as casas se estiver ligada aqui e tiver preço definido.</p>
        {(["boost", "highlight"] as const).map((kind) => (
          <div key={kind} className="border border-border rounded-xl p-3">
            <div className="font-semibold mb-2">{kind === "boost" ? "Impulsionar" : "Destaques"}</div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {SCOPE_KEYS.map((s: ScopeKey) => (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.scopes[kind][s]}
                    onChange={(e) => setDraft({ ...draft, scopes: { ...draft.scopes, [kind]: { ...draft.scopes[kind], [s]: e.target.checked } } })}
                  />
                  {SCOPE_LABEL[s].label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={() => save("scopes")} disabled={saving !== null}>{saving === "scopes" ? "Salvando…" : "Salvar alcance"}</Button>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-display font-bold text-lg">Preços (R$)</h2>
        <div>
          <div className="text-sm font-semibold mb-2">Planos (mensal)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLAN_IDS.map((id) => (
              <div key={id} className="space-y-1">
                <Input aria-label={`Nome do plano ${id}`} value={draft.pricing.plans[id].name} maxLength={30}
                  onChange={(e) => setDraft({ ...draft, pricing: { ...draft.pricing, plans: { ...draft.pricing.plans, [id]: { ...draft.pricing.plans[id], name: e.target.value } } } })} />
                <MoneyInput aria-label={`Mensalidade do plano ${id}`} value={toText(draft.pricing.plans[id].monthly)}
                  onValueChange={(v) => setDraft({ ...draft, pricing: { ...draft.pricing, plans: { ...draft.pricing.plans, [id]: { ...draft.pricing.plans[id], monthly: num(v) } } } })} />
              </div>
            ))}
          </div>
        </div>
        {(["boost_per_day", "highlight_per_day"] as const).map((key) => (
          <div key={key}>
            <div className="text-sm font-semibold mb-2">{key === "boost_per_day" ? "Impulsionar, por dia" : "Destaque, por dia"}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SCOPE_KEYS.map((s) => (
                <div key={s}>
                  <div className="text-xs text-muted-foreground mb-1">{SCOPE_LABEL[s].label}</div>
                  <MoneyInput aria-label={`${key} ${s}`} placeholder="sem preço" value={toText(draft.pricing[key][s])}
                    onValueChange={(v) => setDraft({ ...draft, pricing: { ...draft.pricing, [key]: { ...draft.pricing[key], [s]: num(v) } } })} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={() => save("pricing")} disabled={saving !== null}>{saving === "pricing" ? "Salvando…" : "Salvar preços"}</Button>
      </Card>
      </>}

      {section === "historico" && <Card className="p-5">
        <h2 className="font-display font-bold text-lg mb-2">Histórico de alterações</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma alteração ainda.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {audit.map((a) => (
              <li key={a.id} className="flex gap-2"><Badge tone="muted">{SETTING_LABEL[a.key] ?? a.key}</Badge><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span></li>
            ))}
          </ul>
        )}
      </Card>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl bg-muted/50 border border-border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-2xl">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}
