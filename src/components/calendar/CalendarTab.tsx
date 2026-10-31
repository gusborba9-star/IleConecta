import { useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { deleteCalendarItem, saveCalendarItem, type CalendarDraft, type CalendarItem } from "@/lib/calendar";
import {
  KINDS, SUGGESTIONS, TRADITIONS, VISIBILITY, daysUntil, formatDay, kindDefaultVisibility, kindLabel, nextOccurrence, suggestionsFor, todayLocal, upcoming, whenLabel,
  type CalendarKind,
} from "@/lib/calendarCore";

const emptyDraft = (): CalendarDraft => ({ title: "", tradition: "", kind: "celebracao", date: "", yearly: true, note: "", ...kindDefaultVisibility("celebracao") });

/** Calendário da casa. A casa cadastra, edita e decide, data a data, quem vê: público, seguidores, a própria casa e a assistente. */
export default function CalendarTab({ items, isOwn, onChanged }: { items: CalendarItem[]; isOwn: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [trad, setTrad] = useState<string>(TRADITIONS[0]);
  const today = useMemo(() => todayLocal(), []);


  const list = upcoming(items, today);
  const taken = items.map((i) => i.title);
  const suggestions = isOwn ? suggestionsFor(trad, taken) : [];

  const startFromSuggestion = (id: string) => {
    const s = SUGGESTIONS.find((x) => x.key === id);
    if (!s) return;
    const mm = String(s.month).padStart(2, "0");
    const dd = String(s.day).padStart(2, "0");
    const next = nextOccurrence({ date: `2000-${mm}-${dd}`, yearly: true }, today) ?? `${today.slice(0, 4)}-${mm}-${dd}`;
    setDraft({ title: s.title, tradition: trad, kind: "celebracao", date: next, yearly: true, note: "", ...kindDefaultVisibility("celebracao") });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!draft) return;
    if (draft.title.trim().length < 2) return void toast.error("Dê um nome à data.");
    if (!draft.date) return void toast.error("Escolha a data.");
    setBusy(true);
    const error = await saveCalendarItem({ ...draft, title: draft.title.trim(), note: draft.note.trim() });
    setBusy(false);
    if (error) return void toast.error(error);
    toast.success(draft.id ? "Data atualizada." : "Data adicionada.");
    setDraft(null);
    onChanged();
  };

  const remove = async (item: CalendarItem) => {
    if (!(await confirm({ title: "Remover esta data?", message: item.title, confirmLabel: "Remover" }))) return;
    if (!(await deleteCalendarItem(item.id))) return void toast.error("Não foi possível remover.");
    onChanged();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="font-display font-bold text-lg flex-1">{isOwn ? "Calendário da casa" : "Datas da casa"}</h2>
          {isOwn && !draft && <Button size="sm" onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> Nova data</Button>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isOwn
            ? "Cada casa observa as suas datas. Cadastre celebrações, obrigações e giras e escolha, uma a uma, quem vê: público, seguidores, a casa e a assistente."
            : "Datas que a casa divulga."}
        </p>
      </Card>

      {isOwn && draft && (
        <Card className="p-5 space-y-3 border-primary/40">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cal-title">Nome da data</Label>
              <Input id="cal-title" maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="ex.: Festa de Xangô, obrigação anual da casa…" />
            </div>
            <div>
              <Label htmlFor="cal-kind">Tipo</Label>
              <select id="cal-kind" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.kind}
                onChange={(e) => { const kind = e.target.value as CalendarKind; setDraft({ ...draft, kind, ...(draft.id ? {} : kindDefaultVisibility(kind)) }); }}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cal-date">Data</Label>
              <Input id="cal-date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="cal-trad">Tradição (opcional)</Label>
              <Input id="cal-trad" list="cal-trads" maxLength={40} value={draft.tradition} onChange={(e) => setDraft({ ...draft, tradition: e.target.value })} placeholder="ex.: Umbanda" />
              <datalist id="cal-trads">{TRADITIONS.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" checked={draft.yearly} onChange={(e) => setDraft({ ...draft, yearly: e.target.checked })} />
              Repete todo ano nesta data
            </label>
            <div className="sm:col-span-2">
              <Label htmlFor="cal-note">Observação (opcional)</Label>
              <Textarea id="cal-note" rows={2} maxLength={300} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Horário, roupa branca, o que levar…" />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Quem vê esta data</legend>
            {VISIBILITY.map((v) => (
              <label key={v.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={draft[v.key]} onChange={(e) => setDraft({ ...draft, [v.key]: e.target.checked })} />
                <span><strong>{v.label}</strong> <span className="text-muted-foreground">· {v.hint}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : draft.id ? "Salvar alterações" : "Adicionar ao calendário"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {isOwn && (
        <Card className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold">Sugestões para a sua tradição</h3>
            <p className="text-xs text-muted-foreground">As datas variam de casa para casa e de região para região. Toque para adicionar, confira e ajuste antes de salvar.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tradição">
            {TRADITIONS.map((t) => (
              <button key={t} type="button" aria-pressed={trad === t} onClick={() => setTrad(t)}
                className={`rounded-full border px-3 py-1 text-sm ${trad === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{t}</button>
            ))}
          </div>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {suggestionsFor(trad, [], 1).length === 0
                ? `Não há datas em comum a todas as casas de ${trad}. Cadastre as da sua casa em "Nova data".`
                : "Você já adicionou todas as sugestões desta tradição."}
            </p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li key={s.key} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 break-words"><strong>{s.title}</strong> <span className="text-muted-foreground">· {formatDay(`2000-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`)}</span></span>
                  <Button size="sm" variant="outline" onClick={() => startFromSuggestion(s.key)}>Adicionar</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {list.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{isOwn ? "Nenhuma data cadastrada ainda." : "A casa ainda não divulgou datas."}</Card>
      ) : (
        <div className="space-y-2">
          {list.map((i) => {
            const days = i.next ? daysUntil(i.next, today) : null;
            return (
              <Card key={i.id} className={`p-4 ${i.next ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold break-words">{i.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {i.next ? `${formatDay(i.next, !i.yearly)}${days !== null && days <= 60 ? ` · ${whenLabel(days)}` : ""}` : `${formatDay(i.date, true)} (já passou)`}
                    </div>
                    {i.note && <p className="text-sm mt-1">{i.note}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone="muted">{kindLabel(i.kind)}</Badge>
                    {i.tradition && <Badge tone="muted">{i.tradition}</Badge>}
                    {isOwn && VISIBILITY.filter((v) => i[v.key]).map((v) => <Badge key={v.key} tone={v.key === "vis_house" ? "muted" : "primary"}>{v.label}</Badge>)}
                    {isOwn && VISIBILITY.every((v) => !i[v.key]) && <Badge tone="muted">Oculta</Badge>}
                  </div>
                </div>
                {isOwn && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setDraft({ id: i.id, title: i.title, tradition: i.tradition ?? "", kind: i.kind, date: i.date, yearly: i.yearly, note: i.note ?? "", vis_public: i.vis_public, vis_followers: i.vis_followers, vis_house: i.vis_house, vis_assistant: i.vis_assistant }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="h-4 w-4" /> Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(i)}><Trash2 className="h-4 w-4" /> Remover</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
