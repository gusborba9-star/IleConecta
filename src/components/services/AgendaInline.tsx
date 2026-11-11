import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/components/base";
import { addWindow, fetchBusyItems, fetchWindows, removeWindow, type Window } from "@/lib/agenda";
import { WEEKDAYS, conflictsForWindow, overlapsExistingWindow, validateWindow } from "@/lib/agendaCore";
import type { BusyItem } from "@/lib/agendaCore";

/**
 * Dias e horários de atendimento dentro do formulário do serviço. Não há agenda por serviço: cada horário
 * aqui é gravado na agenda da casa (a mesma do cartão "Agenda de atendimento") e vale para todos os serviços.
 */
export default function AgendaInline({ ownerId, onChange }: { ownerId: string; onChange?: () => void }) {
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [busy, setBusy] = useState<BusyItem[]>([]);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [warn, setWarn] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchWindows(ownerId), fetchBusyItems(ownerId)]).then(([w, b]) => {
      if (!alive) return;
      setWindows(w);
      setBusy(b);
    });
    return () => {
      alive = false;
    };
  }, [ownerId]);

  if (!windows) return null;

  const add = async () => {
    const err = validateWindow(start, end);
    if (err) return void toast.error(err);
    if (overlapsExistingWindow(day, start, end, windows)) return void toast.error("Você já tem um horário neste dia que se sobrepõe a este.");
    setSaving(true);
    const created = await addWindow(ownerId, day, start, end);
    setSaving(false);
    if (!created) return void toast.error("Não foi possível salvar o horário.");
    setWindows([...windows, created].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
    onChange?.();
    setWarn(conflictsForWindow(day, start, end, busy).map((c) => `${c.when}: você já tem ${c.label}.`));
  };
  const del = async (w: Window) => {
    if (await removeWindow(w.id)) {
      setWindows(windows.filter((x) => x.id !== w.id));
      onChange?.();
    }
    else toast.error("Não foi possível remover.");
  };

  const sel = "h-10 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <p className="text-sm font-semibold">Dias e horários que você atende</p>
      <p className="text-xs text-muted-foreground">Vale para todos os seus serviços com agenda: é a mesma agenda da casa. Horários no fuso de Brasília.</p>
      {windows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum horário ainda. Sem horários, a assistente não tem o que oferecer.</p>}
      {windows.map((w) => (
        <div key={w.id} className="flex items-center gap-2 text-sm">
          <span className="w-24 font-semibold">{WEEKDAYS.find((d) => d.id === w.weekday)?.label}</span>
          <span className="flex-1">{w.start} às {w.end}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => void del(w)}>Remover</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="ai-day">Dia</Label>
          <select id="ai-day" className={sel} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {WEEKDAYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div><Label htmlFor="ai-s">Das</Label><Input id="ai-s" type="time" className="w-28" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><Label htmlFor="ai-e">Até</Label><Input id="ai-e" type="time" className="w-28" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void add()}>{saving ? "Salvando…" : "Adicionar horário"}</Button>
      </div>
      {warn.length > 0 && (
        <div className="rounded-xl bg-gold/15 px-3 py-2 text-xs text-foreground space-y-1" role="status">
          <p className="font-semibold">Horário salvo. Atenção: já existe algo marcado dentro dele.</p>
          {warn.map((w) => <p key={w}>{w}</p>)}
          <p>Esses horários continuam ocupados: ninguém consegue agendar por cima.</p>
        </div>
      )}
    </div>
  );
}
