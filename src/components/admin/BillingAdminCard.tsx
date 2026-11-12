import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input } from "@/components/base";
import { supabase } from "@/lib/supabase";
import { saveSetting } from "@/lib/platformConfig";
import { formatCents } from "@/lib/financePanelCore";
import { statusLabel, statusTone, shortDate } from "@/lib/platformBillingCore";
import { KINDS, KIND_ADMIN_LABELS, METHODS, METHOD_LABELS, buildConfig, canCancel, needsEnableConfirm, toggleMethod, type AdminCharge, type ConfigForm } from "@/lib/billingAdminCore";
import { cancelCharge, enrollHouse, fetchAdminCharges, fetchBillingConfig, fetchDuplicates, fetchEnrollments, unenrollHouse, type DupEvent, type Enrollment } from "@/lib/billingAdmin";

interface HouseRow { house_id: string; name: string }
const LEVEL_LABEL: Record<string, string> = { ok: "Em dia", parcial: "Suspensão parcial", total: "Bloqueio total" };

/** Cobrança da plataforma às casas: regras, casas inscritas, faturas e pagamentos duplicados. Nada é cobrado de quem não foi inscrito. */
export default function BillingAdminCard() {
  const [saved, setSaved] = useState<ConfigForm | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [enr, setEnr] = useState<Enrollment[]>([]);
  const [charges, setCharges] = useState<AdminCharge[]>([]);
  const [dups, setDups] = useState<DupEvent[]>([]);
  const [pick, setPick] = useState("");
  const [day, setDay] = useState("10");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cfg, e, c, d] = await Promise.all([fetchBillingConfig(), fetchEnrollments(), fetchAdminCharges(), fetchDuplicates()]);
    if (cfg) {
      setSaved(cfg);
      setForm(cfg);
    }
    setEnr(e);
    setCharges(c);
    setDups(d);
    if (supabase) {
      const { data } = await supabase.rpc("admin_houses_plans");
      setHouses(((data as HouseRow[] | null) ?? []).map((h) => ({ house_id: String(h.house_id), name: String(h.name) })));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (id: string) => houses.find((h) => h.house_id === id)?.name ?? "Casa removida";
  if (!form || !saved) return <Card className="p-5 text-sm text-muted-foreground">Carregando a cobrança…</Card>;

  const built = buildConfig(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const problem = "error" in built ? built.error : null;
  const set = (patch: Partial<ConfigForm>) => setForm({ ...form, ...patch });

  const save = async () => {
    if ("error" in built) return void toast.error(built.error);
    if (needsEnableConfirm(saved, form) && !confirmOn) return setConfirmOn(true);
    setSaving(true);
    const ok = await saveSetting("billing_config", built.value);
    setSaving(false);
    setConfirmOn(false);
    if (ok) {
      toast.success("Regras de cobrança salvas.");
      await load();
    } else toast.error("Não foi possível salvar.");
  };

  const reasonOk = reason.trim().length >= 10;
  const run = async (key: string, fn: () => Promise<string | null>, okMsg: string) => {
    if (!reasonOk) return void toast.error("Informe o motivo (mínimo de 10 caracteres).");
    setBusy(key);
    const err = await fn();
    setBusy(null);
    if (err) toast.error(err);
    else {
      toast.success(okMsg);
      setReason("");
      await load();
    }
  };

  const enrolled = new Set(enr.filter((x) => x.active).map((x) => x.houseId));
  const candidates = houses.filter((h) => !enrolled.has(h.house_id));
  const dayN = /^[0-9]{1,2}$/.test(day.trim()) ? Number(day.trim()) : NaN;

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg">Cobrança da plataforma</h2>
        <p className="text-sm text-muted-foreground">
          Regras da cobrança mensal às casas. Só as casas inscritas abaixo são cobradas; com a cobrança desligada ninguém recebe fatura, aviso ou suspensão.
        </p>
      </div>

      <section className="space-y-3" aria-label="Regras">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Cobrança ligada
          <Badge tone={saved.enabled ? "forest" : "muted"}>{saved.enabled ? "Ligada" : "Desligada"}</Badge>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["noticeDays", "Aviso antes do vencimento (dias)"],
            ["toleranceDays", "Tolerância após o vencimento (dias úteis)"],
            ["totalDays", "Bloqueio total após a suspensão parcial (dias)"],
          ] as const).map(([k, label]) => (
            <label key={k} className="text-sm space-y-1 block">
              <span className="block text-muted-foreground">{label}</span>
              <Input inputMode="numeric" value={String(form[k])} onChange={(e) => set({ [k]: e.target.value } as Partial<ConfigForm>)} />
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Formas de pagamento e provedor</div>
          {KINDS.map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-3 text-sm border border-border rounded-xl p-2">
              <span className="min-w-[10rem] flex-1">{KIND_ADMIN_LABELS[k]}</span>
              {METHODS.map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input type="checkbox" checked={form.methods[k].includes(m)} onChange={() => set({ methods: { ...form.methods, [k]: toggleMethod(form.methods[k], m) } })} />
                  {METHOD_LABELS[m]}
                </label>
              ))}
              <Input aria-label={`Provedor de ${KIND_ADMIN_LABELS[k]}`} className="w-28" value={form.provider[k]} onChange={(e) => set({ provider: { ...form.provider, [k]: e.target.value.trim().toLowerCase() } })} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">O Pix recorrente automático não existe para contas brasileiras no Stripe: o Pix é pago manualmente todo mês, e o cartão recorrente guarda o cartão da casa.</p>
        </div>
        {problem && <p className="text-sm text-destructive">{problem}</p>}
        {confirmOn && (
          <div role="alert" className="rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm space-y-2">
            <p>Ligar a cobrança faz o motor emitir faturas e suspender casas inscritas que atrasarem. Confirme que o provedor e as chaves já estão ativos.</p>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Sim, ligar a cobrança"}</Button>
              <Button variant="outline" onClick={() => setConfirmOn(false)}>Voltar</Button>
            </div>
          </div>
        )}
        {!confirmOn && <Button onClick={save} disabled={saving || !dirty || problem !== null}>{saving ? "Salvando…" : "Salvar regras"}</Button>}
      </section>

      <section className="space-y-2" aria-label="Casas inscritas">
        <div className="text-sm font-semibold">Casas inscritas na cobrança</div>
        <Input aria-label="Motivo da ação" placeholder="Motivo (mínimo de 10 caracteres; fica no registro de auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        {enr.filter((x) => x.active).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma casa inscrita.</p>}
        {enr.filter((x) => x.active).map((x) => (
          <div key={x.houseId} className="flex flex-wrap items-center gap-2 text-sm border border-border rounded-xl p-2">
            <span className="flex-1 min-w-[8rem] font-semibold">{nameOf(x.houseId)}</span>
            <span className="text-muted-foreground">vence todo dia {x.day}</span>
            <Badge tone={x.level === "ok" ? "forest" : "danger"}>{LEVEL_LABEL[x.level] ?? x.level}</Badge>
            <Button variant="outline" disabled={busy === `u-${x.houseId}`} onClick={() => run(`u-${x.houseId}`, () => unenrollHouse(x.houseId, reason), "Casa retirada da cobrança.")}>Retirar</Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Casa a inscrever" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Escolha uma casa…</option>
            {candidates.map((h) => <option key={h.house_id} value={h.house_id}>{h.name}</option>)}
          </select>
          <span>vence dia</span>
          <Input aria-label="Dia do vencimento" className="w-16" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          <Button disabled={!pick || !(dayN >= 1 && dayN <= 28) || busy === "enroll"} onClick={() => run("enroll", () => enrollHouse(pick, dayN, reason), "Casa inscrita na cobrança.")}>Inscrever</Button>
        </div>
        <p className="text-xs text-muted-foreground">Dia do vencimento de 1 a 28.</p>
      </section>

      <section className="space-y-2" aria-label="Faturas">
        <div className="text-sm font-semibold">Últimas faturas</div>
        {charges.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fatura emitida.</p>}
        {charges.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-border pb-2">
            <span className="flex-1 min-w-[8rem]">{nameOf(c.houseId)} · {c.description ?? c.kind}</span>
            <span className="text-muted-foreground">vence {shortDate(c.dueDate)}</span>
            <strong>{formatCents(c.amountCents)}</strong>
            <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
            {c.status === "paga" && <span className="text-xs text-muted-foreground">tarifa {c.feeCents === null ? "ainda desconhecida" : formatCents(c.feeCents)}</span>}
            {canCancel(c.status) && <Button variant="outline" disabled={busy === `c-${c.id}`} onClick={() => run(`c-${c.id}`, () => cancelCharge(c.id, reason), "Fatura cancelada.")}>Cancelar</Button>}
          </div>
        ))}
      </section>

      <section className="space-y-2" aria-label="Pagamentos duplicados">
        <div className="text-sm font-semibold">Pagamentos duplicados a devolver</div>
        {dups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento duplicado.</p>}
        {dups.map((d) => (
          <p key={d.id} className="text-sm border border-destructive/40 rounded-xl p-2">{new Date(d.at).toLocaleString("pt-BR")} — {d.reason}</p>
        ))}
      </section>
    </Card>
  );
}
