import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label, Modal, Textarea } from "@/components/base";
import { BOOKABLE_KINDS, SERVICE_DELIVERIES, SERVICE_KINDS, formatCents, parsePriceToCents, validateService, type ServiceFormInput, type ServiceValue } from "@/lib/servicesCore";
import MoneyInput from "@/components/base/MoneyInput";
import { centsToMasked } from "@/lib/moneyMask";
import type { Service } from "@/lib/services";
import { fetchPaymentMaxCents } from "@/lib/paymentLimit";
import { MAX_PAYMENT_CENTS, MAX_STAGES, stagePlan, stagesNeeded } from "@/lib/paymentsCore";

interface Props {
  open: boolean;
  onClose: () => void;
  initial: Service | null;
  /** Devolve true quando gravou; o formulário fecha. */
  onSubmit: (value: ServiceValue) => Promise<boolean>;
}

const EMPTY: ServiceFormInput = { kind: "", customKind: "", title: "", description: "", priceText: "", delivery: "", stages: 1, bookable: false, durationMin: 30 };

export default function ServiceForm({ open, onClose, initial, onSubmit }: Props) {
  const [form, setForm] = useState<ServiceFormInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [cap, setCap] = useState(MAX_PAYMENT_CENTS);

  useEffect(() => {
    if (open) void fetchPaymentMaxCents().then(setCap);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSaving(false);
    setForm(
      initial
        ? {
            kind: initial.kind,
            customKind: initial.customKind ?? "",
            title: initial.title,
            description: initial.description ?? "",
            priceText: centsToMasked(initial.priceCents),
            delivery: initial.delivery,
            stages: initial.stages,
            bookable: initial.bookable,
            durationMin: initial.durationMin,
          }
        : EMPTY
    );
  }, [open, initial]);

  const priceCents = parsePriceToCents(form.priceText);
  const stages = Number(form.stages ?? 1);
  const needed = priceCents ? stagesNeeded(priceCents, cap) : 1;
  const plan = priceCents && stages > 1 ? stagePlan(priceCents, stages) : null;

  const set = (patch: Partial<ServiceFormInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateService(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    const ok = await onSubmit(result.value);
    setSaving(false);
    if (ok) onClose();
    else toast.error("Não foi possível salvar. Tente novamente.");
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar serviço" : "Novo serviço"} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="text-sm font-semibold mb-2">Tipo de serviço</legend>
          <div className="flex flex-wrap gap-2">
            {SERVICE_KINDS.map((k) => (
              <label
                key={k.id}
                className={`cursor-pointer px-4 min-h-11 inline-flex items-center rounded-full border text-sm font-medium transition ${
                  form.kind === k.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                }`}
              >
                <input type="radio" name="kind" className="sr-only" checked={form.kind === k.id} onChange={() => set({ kind: k.id })} />
                {k.label}
              </label>
            ))}
          </div>
          {errors.kind && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.kind}</p>}
        </fieldset>

        {form.kind === "outro" && (
          <div>
            <Label htmlFor="sv-custom">Nome do tipo de serviço</Label>
            <Input id="sv-custom" maxLength={40} value={form.customKind} onChange={(e) => set({ customKind: e.target.value })} placeholder="ex.: Benzimento" />
            {errors.customKind && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.customKind}</p>}
          </div>
        )}

        <div>
          <Label htmlFor="sv-title">Nome do serviço</Label>
          <Input id="sv-title" maxLength={100} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex.: Jogo de búzios completo" />
          {errors.title && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.title}</p>}
        </div>

        <div>
          <Label htmlFor="sv-desc">Descrição (opcional)</Label>
          <Textarea id="sv-desc" maxLength={600} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="O que está incluído, duração, o que o cliente deve levar…" />
          {errors.description && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.description}</p>}
        </div>

        <div>
          <Label htmlFor="sv-price">Valor (R$)</Label>
          <MoneyInput id="sv-price" value={form.priceText} onValueChange={(v) => set({ priceText: v })} placeholder="200,00" />
          {errors.price && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.price}</p>}
        </div>

        <div>
          <Label htmlFor="sv-stages">Pagamento em etapas</Label>
          <select
            id="sv-stages"
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            value={stages}
            onChange={(e) => set({ stages: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_STAGES }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n === 1 ? "À vista (1 pagamento)" : `${n} etapas`}</option>
            ))}
          </select>
          {plan && <p className="text-sm text-muted-foreground mt-1">Etapas: {plan.map((v) => formatCents(v)).join(" + ")}. O cliente vê esse plano antes de pagar; as datas das etapas seguintes vocês combinam.</p>}
          {needed === null && priceCents !== null && (
            <p className="text-sm text-[hsl(var(--danger))] mt-1">Este valor passa do que a plataforma recebe ({formatCents(cap * MAX_STAGES)}). Combine o pagamento direto com o cliente.</p>
          )}
          {needed !== null && needed > stages && (
            <p className="text-sm text-[hsl(var(--danger))] mt-1">Cada pagamento pela plataforma vai até {formatCents(cap)}. Para este valor, escolha pelo menos {needed} etapas; senão o cliente não consegue contratar pela plataforma.</p>
          )}
          {errors.stages && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.stages}</p>}
        </div>

        <fieldset>
          <legend className="text-sm font-semibold mb-2">Como é realizado</legend>
          <div className="grid gap-2">
            {SERVICE_DELIVERIES.map((d) => (
              <label
                key={d.id}
                className={`cursor-pointer rounded-xl border p-3 flex gap-3 items-start transition ${
                  form.delivery === d.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <input type="radio" name="delivery" className="mt-1 h-4 w-4" checked={form.delivery === d.id} onChange={() => set({ delivery: d.id })} />
                <span>
                  <span className="block text-sm font-semibold">{d.label}</span>
                  <span className="block text-sm text-muted-foreground">{d.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.delivery && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.delivery}</p>}
        </fieldset>

        {form.kind && BOOKABLE_KINDS.includes(form.kind) && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={Boolean(form.bookable)} onChange={(e) => set({ bookable: e.target.checked })} />
              <span>
                <span className="block font-semibold">Agendar horário pela plataforma</span>
                <span className="block text-muted-foreground">O cliente escolhe um dia e horário livres da sua agenda e paga na hora. Você é avisado de cada agendamento.</span>
              </span>
            </label>
            {form.bookable && (
              <div>
                <Label htmlFor="sv-dur">Duração de cada atendimento (minutos)</Label>
                <Input id="sv-dur" type="number" min={10} max={240} step={5} className="w-28" value={form.durationMin ?? 30} onChange={(e) => set({ durationMin: e.target.value })} />
                {errors.durationMin && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors.durationMin}</p>}
                <p className="text-xs text-muted-foreground mt-1">Cadastre seus dias e horários em “Agenda de atendimento”, nesta aba.</p>
              </div>
            )}
            {errors.bookable && <p className="text-sm text-[hsl(var(--danger))]">{errors.bookable}</p>}
          </div>
        )}

        <p className="text-xs text-muted-foreground">O pagamento é combinado diretamente com o cliente. O pagamento pela plataforma (Pix) chega em breve.</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar alterações" : "Adicionar serviço"}</Button>
        </div>
      </form>
    </Modal>
  );
}
