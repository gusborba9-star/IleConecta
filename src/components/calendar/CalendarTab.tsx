import { useMemo, useState } from "react";
import { previewRows, whenText } from "@/lib/calendarPreview";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { deleteCalendarItem, saveCalendarItem, type CalendarDraft, type CalendarItem } from "@/lib/calendar";
import {
  KINDS, MONTHS, SUGGESTIONS, parseDate, VISIBILITY, formatDay, kindDefaultVisibility, kindLabel, nextOccurrence, traditionalDates, todayLocal, upcoming,
  type CalendarKind,
} from "@/lib/calendarCore";

const emptyDraft = (): CalendarDraft => ({ title: "", tradition: "", kind: "gira", date: "", time: "", yearly: true, note: "", ...kindDefaultVisibility("gira") });

/** Calendário da casa. A casa cadastra, edita e decide, data a data, quem vê: público, seguidores, a própria casa e a assistente. */
export default function CalendarTab({ items, isOwn, onChanged }: { items: CalendarItem[]; isOwn: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => todayLocal(), []);


  const list = upcoming(items, today);
  const taken = items.map((i) => i.title);
  const suggestions = isOwn ? traditionalDates(taken) : [];

  const startFromSuggestion = (id: string) => {
    const s = SUGGESTIONS.find((x) => x.key === id);
    if (!s) return;
    const mm = String(s.month).padStart(2, "0");
    const dd = String(s.day).padStart(2, "0");
    const next = nextOccurrence({ date: `2000-${mm}-${dd}`, yearly: true }, today) ?? `${today.slice(0, 4)}-${mm}-${dd}`;
    setDraft({ title: s.title, tradition: "", kind: "celebracao", date: next, time: "", yearly: true, note: "", ...kindDefaultVisibility("celebracao") });
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
    if (!(await confirm({ title: "Tirar da agenda?", message: item.title, confirmLabel: "Remover" }))) return;
    if (!(await deleteCalendarItem(item.id))) return void toast.error("Não foi possível remover.");
    onChanged();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="font-display font-bold text-lg flex-1">{isOwn ? "Agenda da Casa" : "Datas da casa"}</h2>
          {isOwn && !draft && <Button size="sm" onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> Marcar na agenda</Button>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isOwn
            ? "Centralize em um só lugar as cerimônias, encontros, festividades e tudo o que marca a vida da sua casa. Você controla, data a data, quem vê: o público, os seguidores ou só os membros da casa. E a Assistente Virtual atende quem procura a sua casa com tudo o que você registrar na agenda (dia, horário e orientações), a qualquer hora."
            : "Datas que a casa divulga."}
        </p>
      </Card>

      {isOwn && draft && (
        <Card className="p-5 space-y-3 border-primary/40">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cal-title">Nome da data</Label>
              <Input id="cal-title" maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="ex.: Encontro aberto, festividade da casa, reunião de estudo…" />
            </div>
            <div>
              <Label htmlFor="cal-kind">Tipo</Label>
              <select id="cal-kind" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.kind}
                onChange={(e) => { const kind = e.target.value as CalendarKind; setDraft({ ...draft, kind, ...(draft.id ? {} : kindDefaultVisibility(kind)) }); }}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}{k.hint ? ` (${k.hint})` : ""}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cal-date">Data</Label>
              <Input id="cal-date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="cal-time">Horário (opcional)</Label>
              <Input id="cal-time" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="cal-trad">Tradição ou linha da casa (opcional)</Label>
              <Input id="cal-trad" maxLength={40} value={draft.tradition} onChange={(e) => setDraft({ ...draft, tradition: e.target.value })} placeholder="como a sua casa se identifica" />
            </div>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" checked={draft.yearly} onChange={(e) => setDraft({ ...draft, yearly: e.target.checked })} />
              Repete todo ano nesta data
            </label>
            <div className="sm:col-span-2">
              <Label htmlFor="cal-note">Observação (opcional)</Label>
              <Textarea id="cal-note" rows={2} maxLength={300} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Orientações: roupa, o que levar, como chegar…" />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Quem fica sabendo</legend>
            {VISIBILITY.map((v) => (
              <label key={v.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={draft[v.key]} onChange={(e) => setDraft({ ...draft, [v.key]: e.target.checked })} />
                <span><strong>{v.label}</strong> <span className="text-muted-foreground">· {v.hint}</span></span>
              </label>
            ))}
          </fieldset>
          {draft.title.trim().length >= 2 && draft.date && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 pillow" aria-live="polite">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Assim aparece</div>
              {previewRows(draft, today).map((r) => (
                <div key={r.key} className={`flex gap-3 text-sm ${r.on ? "" : "opacity-50"}`}>
                  <div className="w-28 shrink-0 text-xs font-semibold text-muted-foreground pt-0.5">{r.label}</div>
                  {r.key === "vis_assistant" && r.on
                    ? <div className="rounded-2xl rounded-tl-sm bg-primary/10 px-3 py-1.5 break-words">{r.text}</div>
                    : <div className="break-words">{r.on ? r.text : r.off}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : draft.id ? "Salvar alterações" : "Marcar na agenda"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {isOwn && (
        <Card className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold">Datas que muitas casas celebram</h3>
            <p className="text-xs text-muted-foreground">Confira a data na sua casa antes de salvar. Para outras, use "Marcar na agenda".</p>
          </div>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você já marcou todas. Para outras datas, use "Marcar na agenda".
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
        <Card className="p-6 text-sm text-muted-foreground">{isOwn ? "Sua agenda está vazia. Marque a primeira cerimônia, encontro ou festividade." : "A casa ainda não divulgou datas."}</Card>
      ) : (
        <div className="space-y-2">
          {list.map((i) => {
            return (
              <Card key={i.id} className={`lift p-4 ${i.next ? "" : "opacity-60"} ${i.vis_public ? "bg-[#FBF2DE] border-[#AA781E]/30 dark:bg-gold/10" : "bg-[#E8F1EA] border-[#1F5B43]/25 dark:bg-forest/10"}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <DateTile date={i.next ?? i.date} gold={i.vis_public} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold break-words">{i.title}</div>
                    <div className="text-sm text-muted-foreground">{whenText(i, today)}</div>
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
                    <Button size="sm" variant="ghost" onClick={() => { setDraft({ id: i.id, title: i.title, tradition: i.tradition ?? "", kind: i.kind, date: i.date, time: i.time ?? "", yearly: i.yearly, note: i.note ?? "", vis_public: i.vis_public, vis_followers: i.vis_followers, vis_house: i.vis_house, vis_assistant: i.vis_assistant }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="h-4 w-4" /> Editar</Button>
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

/** Quadro com mês e dia, no estilo dos cartões de ritual e jogo. */
function DateTile({ date, gold }: { date: string; gold: boolean }) {
  const d = parseDate(date);
  if (!d) return null;
  return (
    <div className={`flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl bg-card shadow-card ring-1 ${gold ? "ring-[#AA781E]/30" : "ring-[#1F5B43]/25"}`} aria-hidden>
      <span className={`text-[10px] font-bold tracking-[0.1em] ${gold ? "text-[#8A520C]" : "text-[#1F5B43]"}`}>{(MONTHS[d.m - 1] ?? "").slice(0, 3).toUpperCase()}</span>
      <span className="font-display text-xl font-bold leading-none">{String(d.d).padStart(2, "0")}</span>
    </div>
  );
}
