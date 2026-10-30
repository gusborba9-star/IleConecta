import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label, Modal, Textarea } from "@/components/base";
import MoneyInput from "@/components/base/MoneyInput";
import { centsToMasked, maskedToCents } from "@/lib/moneyMask";
import { BOND_OPTIONS, type HouseMember, type MemberInput } from "@/lib/members";

interface Props {
  open: boolean;
  onClose: () => void;
  initial: HouseMember | null;
  defaults: { cents: number; dueDay: number };
  /** Devolve a mensagem de erro, ou null se gravou. */
  onSubmit: (v: MemberInput) => Promise<string | null>;
}

const QUICK = [80, 100, 120, 150];

export default function MemberForm({ open, onClose, initial, defaults, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [bond, setBond] = useState("");
  const [money, setMoney] = useState("");
  const [dueDay, setDueDay] = useState(10);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setBond("");
    setNote("");
    setMoney(centsToMasked(defaults.cents || null));
    setDueDay(defaults.dueDay);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setError(null);
    if (initial) {
      setName(initial.name);
      setBond(initial.bond ?? "");
      setNote(initial.note ?? "");
      setMoney(centsToMasked(initial.monthlyCents || null));
      setDueDay(initial.dueDay);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const submit = async (another: boolean) => {
    const cents = money.trim() ? maskedToCents(money) : 0;
    if (name.trim().length < 2) return setError("Informe o nome (pelo menos 2 letras).");
    if (cents === null || (cents !== 0 && (cents < 100 || cents > 1000000))) return setError("Valor inválido. Use de R$ 1,00 a R$ 10.000,00, ou deixe vazio se não há mensalidade.");
    setError(null);
    setSaving(true);
    const err = await onSubmit({ name: name.trim(), bond: bond.trim(), note: note.trim(), cents, dueDay });
    setSaving(false);
    if (err) return setError(err);
    if (another) {
      toast.success("Membro adicionado.");
      reset();
    } else onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar membro" : "Novo membro"} maxWidth="max-w-lg">
      <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="mb-name">Nome</Label>
          <Input id="mb-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Como a casa chama a pessoa" />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold mb-2">Vínculo com a casa</legend>
          <div className="flex flex-wrap gap-2">
            {BOND_OPTIONS.map((b) => (
              <button key={b} type="button" onClick={() => setBond(bond === b ? "" : b)} className={`px-3 min-h-9 rounded-full border text-xs font-medium transition ${bond === b ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {b}
              </button>
            ))}
          </div>
          <Input aria-label="Outro vínculo" className="mt-2" maxLength={40} value={BOND_OPTIONS.includes(bond as never) ? "" : bond} onChange={(e) => setBond(e.target.value)} placeholder="Outro (escreva aqui)" />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="mb-money">Mensalidade (R$)</Label>
            <MoneyInput id="mb-money" value={money} onValueChange={setMoney} placeholder="100,00" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK.map((v) => (
                <button key={v} type="button" onClick={() => setMoney(centsToMasked(v * 100))} className="px-2.5 min-h-8 rounded-full border border-border text-xs hover:bg-muted">R$ {v}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Deixe vazio se a pessoa não paga mensalidade.</p>
          </div>
          <div>
            <Label htmlFor="mb-day">Vence todo dia</Label>
            <select id="mb-day" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="mb-note">Anotação reservada (opcional)</Label>
          <Textarea id="mb-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Só a casa vê. Não é compartilhada com a pessoa." />
        </div>

        {error && <p className="text-sm text-[hsl(var(--danger))]" role="alert">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          {!initial && <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(true)}>Salvar e adicionar outro</Button>}
          <Button type="submit" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar alterações" : "Adicionar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
