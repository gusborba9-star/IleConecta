import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button, Input, Label, Modal, Textarea } from "@/components/base";
import { FIELD_PRESETS, MAX_FIELDS, RITUAL_MODES, fromIsoToBrt, validateRitual, type RitualFormInput, type RitualValue } from "@/lib/ritualsCore";
import MoneyInput from "@/components/base/MoneyInput";
import { centsToMasked } from "@/lib/moneyMask";
import type { RealRitual } from "@/lib/rituals";
import { useApp } from "@/contexts/AppContext";
import { paymentsEnabledFor } from "@/lib/consents";

interface Props {
  open: boolean;
  onClose: () => void;
  initial: RealRitual | null;
  initialStreamUrl: string;
  /** publish=true quando a casa escolheu publicar agora. Devolve true se gravou. */
  onSubmit: (value: RitualValue, publish: boolean) => Promise<boolean>;
}

const EMPTY: RitualFormInput = { title: "", description: "", priceText: "", seatsText: "", mode: "", date: "", time: "", streamUrl: "", fields: [{ id: "nome_completo", label: "Nome completo", required: true }] };

export default function RitualForm({ open, onClose, initial, initialStreamUrl, onSubmit }: Props) {
  const [form, setForm] = useState<RitualFormInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const { currentUser } = useApp();
  const [payOn, setPayOn] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void paymentsEnabledFor(currentUser?.id).then((v) => alive && setPayOn(v));
    return () => {
      alive = false;
    };
  }, [open, currentUser?.id]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSaving(false);
    if (!initial) return setForm(EMPTY);
    const when = fromIsoToBrt(initial.startsAt);
    setForm({
      title: initial.title,
      description: initial.description ?? "",
      priceText: centsToMasked(initial.priceCents),
      seatsText: String(initial.seatsTotal),
      mode: initial.mode,
      date: when.date,
      time: when.time,
      streamUrl: initialStreamUrl,
      fields: initial.fields,
      allowPast: true,
    });
  }, [open, initial, initialStreamUrl]);

  const set = (patch: Partial<RitualFormInput>) => setForm((f) => ({ ...f, ...patch }));
  const hasField = (label: string) => form.fields.some((f) => f.label === label);
  const addField = (label: string) => form.fields.length < MAX_FIELDS && set({ fields: [...form.fields, { label, required: false }] });
  const showStream = form.mode === "distancia" || form.mode === "hibrido";

  const submit = async (publish: boolean) => {
    const result = validateRitual({ ...form, streamUrl: showStream ? form.streamUrl : "" });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    const ok = await onSubmit(result.value, publish);
    setSaving(false);
    if (ok) onClose();
    else toast.error("Não foi possível salvar. Tente novamente.");
  };

  const err = (k: string) => errors[k] && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors[k]}</p>;

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar ritual" : "Novo ritual"} maxWidth="max-w-xl">
      <form onSubmit={(e) => { e.preventDefault(); void submit(initial?.status === "publicado"); }} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="rt-title">Nome do ritual</Label>
          <Input id="rt-title" maxLength={100} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex.: Ritual de abertura de caminhos" />
          {err("title")}
        </div>
        <div>
          <Label htmlFor="rt-desc">Descrição (mín. 20 letras)</Label>
          <Textarea id="rt-desc" maxLength={1500} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Como será, o que o participante vive e o que precisa ter em mãos. A assistente usa este texto para apresentar o ritual antes do pagamento." />
          {err("description")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rt-price">Valor por vaga (R$)</Label>
            <MoneyInput id="rt-price" value={form.priceText} onValueChange={(v) => set({ priceText: v })} placeholder="199,00" />
            {err("price")}
          </div>
          <div>
            <Label htmlFor="rt-seats">Número de vagas</Label>
            <Input id="rt-seats" inputMode="numeric" value={form.seatsText} onChange={(e) => set({ seatsText: e.target.value.replace(/\D/g, "") })} placeholder="300" />
            {err("seats")}
          </div>
          <div>
            <Label htmlFor="rt-date">Data</Label>
            <Input id="rt-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="rt-time">Hora (horário de Brasília)</Label>
            <Input id="rt-time" type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} />
          </div>
        </div>
        {err("when")}

        <fieldset>
          <legend className="text-sm font-semibold mb-2">Como é realizado</legend>
          <div className="grid gap-2">
            {RITUAL_MODES.map((m) => (
              <label key={m.id} className={`cursor-pointer rounded-xl border p-3 flex gap-3 items-start transition ${form.mode === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                <input type="radio" name="mode" className="mt-1 h-4 w-4" checked={form.mode === m.id} onChange={() => set({ mode: m.id })} />
                <span>
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="block text-sm text-muted-foreground">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {err("mode")}
        </fieldset>

        {showStream && (
          <div>
            <Label htmlFor="rt-stream">Link da transmissão (opcional agora)</Label>
            <Input id="rt-stream" inputMode="url" value={form.streamUrl} onChange={(e) => set({ streamUrl: e.target.value })} placeholder="https://…" />
            <p className="text-xs text-muted-foreground mt-1">Só quem tem vaga confirmada vê este link.</p>
            {err("streamUrl")}
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-semibold">Dados que você quer receber de cada participante</legend>
          <p className="text-xs text-muted-foreground mb-2">Peça só o necessário: são dados pessoais e ficam visíveis apenas para a sua casa.</p>
          <div className="space-y-2">
            {form.fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label={`Campo ${i + 1}`} maxLength={60} value={f.label} onChange={(e) => set({ fields: form.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={Boolean(f.required)} onChange={(e) => set({ fields: form.fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} /> Obrigatório
                </label>
                <button type="button" aria-label="Remover campo" className="h-10 w-10 grid place-items-center rounded-full hover:bg-muted" onClick={() => set({ fields: form.fields.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {FIELD_PRESETS.filter((p) => !hasField(p.label)).map((p) => (
              <button key={p.id} type="button" onClick={() => addField(p.label)} className="px-3 min-h-9 rounded-full border border-border text-xs font-medium hover:bg-muted">+ {p.label}</button>
            ))}
            <button type="button" onClick={() => addField("")} className="px-3 min-h-9 rounded-full border border-border text-xs font-medium hover:bg-muted inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Outro campo</button>
          </div>
        </fieldset>

        <p className="text-xs text-muted-foreground">
          {payOn
            ? "O participante paga a vaga pelo app (Pix ou cartão) e a reserva é confirmada na hora. A plataforma cobra 15% e o Stripe cobra a tarifa dele."
            : "O pagamento pelo app ainda não está ativo para a sua casa. Por enquanto, a vaga é reservada sem cobrança e vocês combinam o pagamento diretamente."}
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          {initial ? (
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(false)}>Salvar como rascunho</Button>
              <Button type="button" disabled={saving} onClick={() => void submit(true)}>{saving ? "Salvando…" : "Publicar ritual"}</Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
