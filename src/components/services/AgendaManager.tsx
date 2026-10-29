import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input, Label } from "@/components/base";
import { addBlock, addWindow, fetchBlocks, fetchWindows, removeBlock, removeWindow, type Block, type Window } from "@/lib/agenda";
import { WEEKDAYS, brasiliaToIso, formatSlot, validateWindow } from "@/lib/agendaCore";

/** Agenda da casa: dias e horários de atendimento e bloqueios manuais. */
export default function AgendaManager({ ownerId }: { ownerId: string }) {
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [bDay, setBDay] = useState("");
  const [bStart, setBStart] = useState("09:00");
  const [bEnd, setBEnd] = useState("18:00");
  const [bNote, setBNote] = useState("");

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchWindows(ownerId), fetchBlocks(ownerId)]).then(([w, b]) => {
      if (!alive) return;
      setWindows(w);
      setBlocks(b);
    });
    return () => {
      alive = false;
    };
  }, [ownerId]);

  if (!windows) return null;

  const add = async () => {
    const err = validateWindow(start, end);
    if (err) return void toast.error(err);
    const created = await addWindow(ownerId, day, start, end);
    if (!created) return void toast.error("Não foi possível salvar o horário.");
    setWindows([...windows, created].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
  };
  const del = async (w: Window) => {
    if (await removeWindow(w.id)) setWindows(windows.filter((x) => x.id !== w.id));
    else toast.error("Não foi possível remover.");
  };
  const block = async () => {
    const err = validateWindow(bStart, bEnd);
    if (!bDay) return void toast.error("Escolha o dia do bloqueio.");
    if (err) return void toast.error(err);
    const created = await addBlock(ownerId, brasiliaToIso(bDay, bStart), brasiliaToIso(bDay, bEnd), bNote);
    if (!created) return void toast.error("Não foi possível bloquear.");
    setBlocks([...blocks, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    setBNote("");
  };
  const unblock = async (b: Block) => {
    if (await removeBlock(b.id)) setBlocks(blocks.filter((x) => x.id !== b.id));
    else toast.error("Não foi possível remover.");
  };

  const sel = "h-10 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-lg">Agenda de atendimento</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Defina os dias e horários em que você atende. Nos serviços marcados com agenda (búzios, cartas, consulta), o cliente escolhe um desses horários e paga pela plataforma. Horários no fuso de Brasília.
      </p>

      <div className="space-y-1">
        {windows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum horário cadastrado ainda. Sem horários, ninguém consegue agendar.</p>}
        {windows.map((w) => (
          <div key={w.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 font-semibold">{WEEKDAYS.find((d) => d.id === w.weekday)?.label}</span>
            <span className="flex-1">{w.start} às {w.end}</span>
            <Button size="sm" variant="ghost" onClick={() => void del(w)}>Remover</Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="ag-day">Dia</Label>
          <select id="ag-day" className={sel} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {WEEKDAYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div><Label htmlFor="ag-s">Das</Label><Input id="ag-s" type="time" className="w-28" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><Label htmlFor="ag-e">Até</Label><Input id="ag-e" type="time" className="w-28" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => void add()}>Adicionar horário</Button>
      </div>

      <div className="border-t border-border/60 pt-3 space-y-2">
        <h4 className="font-semibold text-sm">Bloquear um horário</h4>
        <p className="text-xs text-muted-foreground">Folga, viagem ou um atendimento que você combinou fora da plataforma.</p>
        {blocks.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{formatSlot(b.startsAt)} até {formatSlot(b.endsAt).split(" às ")[1]}{b.note ? ` · ${b.note}` : ""}</span>
            <Button size="sm" variant="ghost" onClick={() => void unblock(b)}>Liberar</Button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="bk-d">Dia</Label><Input id="bk-d" type="date" className="w-40" value={bDay} onChange={(e) => setBDay(e.target.value)} /></div>
          <div><Label htmlFor="bk-s">Das</Label><Input id="bk-s" type="time" className="w-28" value={bStart} onChange={(e) => setBStart(e.target.value)} /></div>
          <div><Label htmlFor="bk-e">Até</Label><Input id="bk-e" type="time" className="w-28" value={bEnd} onChange={(e) => setBEnd(e.target.value)} /></div>
          <div className="flex-1 min-w-[140px]"><Label htmlFor="bk-n">Motivo (opcional)</Label><Input id="bk-n" maxLength={120} value={bNote} onChange={(e) => setBNote(e.target.value)} /></div>
          <Button size="sm" variant="outline" onClick={() => void block()}>Bloquear</Button>
        </div>
      </div>
    </Card>
  );
}
