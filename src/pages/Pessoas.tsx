import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { Avatar, Badge, Button, Card, Input } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchHousePeople, fetchPersonTimeline } from "@/lib/housePeople";
import {
  EVENT_LABELS, SEGMENTS, SEGMENT_HINTS, SEGMENT_LABELS, agoText, eventDetailText, eventTarget,
  type HousePeopleView, type HousePerson, type PeopleSegment, type PersonTimeline,
} from "@/lib/housePeopleCore.js";
import { formatBRL } from "@/lib/utils";

const PAGE = 50;
const TONE: Record<string, "gold" | "primary" | "muted" | "forest" | "danger" | "plum"> = {
  pendencia: "danger", sumido: "muted", recorrente: "gold", cliente: "forest", membro: "plum", participante: "primary", interessado: "muted", conversou: "muted", seguidor: "muted",
};

function Timeline({ personId }: { personId: string }) {
  const nav = useNavigate();
  const [tl, setTl] = useState<PersonTimeline | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPersonTimeline(personId).then((r) => {
      if (!alive) return;
      if (typeof r === "string") setErr(r);
      else setTl(r);
    });
    return () => {
      alive = false;
    };
  }, [personId]);
  if (err) return <p role="alert" className="text-sm text-destructive">{err}</p>;
  if (!tl) return <p className="text-sm text-muted-foreground">Carregando a história…</p>;
  if (tl.events.length === 0) return <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>;
  return (
    <ol className="space-y-2 border-l border-border pl-3" aria-label="Linha do tempo">
      {tl.events.map((e) => {
        const target = eventTarget(e.kind, tl.role);
        const detail = eventDetailText(e.kind, e.detail);
        return (
          <li key={`${e.kind}-${e.refId}-${e.at}`} className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{EVENT_LABELS[e.kind]}</span>
              <span className="text-xs text-muted-foreground" title={new Date(e.at).toLocaleString("pt-BR")}>{agoText(e.at)}</span>
            </div>
            <p className="break-words">{e.title}{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}</p>
            {target && <button type="button" className="text-xs font-semibold text-primary underline min-h-11 -my-2" onClick={() => nav(target)}>Abrir onde se resolve</button>}
          </li>
        );
      })}
    </ol>
  );
}

function PersonRow({ p, showMoney }: { p: HousePerson; showMoney: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-border p-3 space-y-2 pillow">
      <button type="button" className="flex w-full min-h-11 items-center gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar src={p.avatarUrl ?? undefined} name={p.name} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words">{p.name}</span>
          <span className="block text-xs text-muted-foreground">
            {p.lastAt ? `Última atividade ${agoText(p.lastAt)}` : "Sem atividade"}
            {p.purchases > 0 ? ` · ${p.purchases} ${p.purchases === 1 ? "compra" : "compras"}` : ""}
            {showMoney && p.spentCents !== null && p.spentCents > 0 ? ` · ${formatBRL(p.spentCents / 100)}` : ""}
          </span>
        </span>
        {open ? <ChevronUp className="h-5 w-5 shrink-0" aria-hidden /> : <ChevronDown className="h-5 w-5 shrink-0" aria-hidden />}
      </button>
      <div className="flex flex-wrap gap-1.5">
        {p.segments.map((s) => <Badge key={s} tone={TONE[s] ?? "muted"}>{SEGMENT_LABELS[s]}</Badge>)}
      </div>
      {open && <div className="pt-1"><Timeline personId={p.personId} /></div>}
    </li>
  );
}

/** Pessoas da casa: quem tem relação real com a casa, por segmento, e a história de cada uma (referência aos registros originais). */
export function PeopleBoard() {
  const [segment, setSegment] = useState<PeopleSegment>("todos");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<HousePeopleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (seg: PeopleSegment, q: string, offset: number) => {
    const mine = ++seq.current;
    setBusy(true);
    const r = await fetchHousePeople(seg, q, offset, PAGE);
    if (mine !== seq.current) return; // resposta de uma busca antiga
    setBusy(false);
    if (typeof r === "string") return void setError(r);
    setError(null);
    setView((old) => (offset > 0 && old ? { ...r, items: [...old.items, ...r.items] } : r));
  }, []);
  useEffect(() => {
    void load(segment, query, 0);
  }, [segment, query, load]);

  const showMoney = view?.role === "titular";
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <div>
        <Link to={view?.role === "equipe" ? "/atendimento" : "/"} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <h1 className="font-display font-bold text-2xl">Pessoas da casa</h1>
        <p className="text-sm text-muted-foreground">Quem tem relação com a sua casa e a história de cada uma. Serve para atender e acompanhar; nada aqui é enviado a ninguém.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Segmentos">
        {SEGMENTS.map((s) => {
          const n = view?.counts[s];
          if (view && s !== "todos" && !n && s !== segment) return null; // só mostra o segmento que tem gente
          return (
            <button key={s} type="button" role="tab" aria-selected={segment === s} title={SEGMENT_HINTS[s]} onClick={() => setSegment(s)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${segment === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>
              {SEGMENT_LABELS[s]}{typeof n === "number" ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{SEGMENT_HINTS[segment]}</p>

      <div>
        <label htmlFor="pessoas-busca" className="sr-only">Buscar pessoa pelo nome</label>
        <Input id="pessoas-busca" type="search" inputMode="search" maxLength={80} placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="p-4 space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : view === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : view.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{query ? "Ninguém com esse nome nesse filtro." : "Ninguém nesse filtro ainda."}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{view.total} {view.total === 1 ? "pessoa" : "pessoas"}</p>
            <ul className="space-y-2">{view.items.map((p) => <PersonRow key={p.personId} p={p} showMoney={showMoney} />)}</ul>
            {view.items.length < view.total && (
              <Button variant="outline" disabled={busy} onClick={() => void load(segment, query, view.items.length)}>Mostrar mais</Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function Pessoas() {
  const { currentUser, isRemoteAuth } = useApp();
  if (!currentUser || !isRemoteAuth) return null;
  return <PeopleBoard />;
}
