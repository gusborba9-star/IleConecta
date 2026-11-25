import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Video } from "lucide-react";
import { Badge, Button, Card, Input, Label, Progress } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { useApp } from "@/contexts/AppContext";
import { cancelMeeting, fetchBank, fetchConsultOrders, fetchHistory, fetchHouseMembers, fetchUpcoming, scheduleMeeting, type HistoryRow, type HouseMemberOption, type UpcomingMeeting, type VideoBank } from "@/lib/video";
import { HelpersEditor, PresenceReport } from "@/components/video/MeetingTools";
import { houseIdOf } from "@/lib/campaigns";
import { KINDS, ROLE_LABEL, bankView, formatWhen, localToIso, meetingPhase, validateSchedule, type VideoKind } from "@/lib/videoCore";

const selectCls = "h-11 w-full rounded-[14px] border border-input bg-card px-3 text-sm";

function Bank({ bank }: { bank: VideoBank }) {
  const v = bankView(bank);
  return (
    <Card className="space-y-2 p-5" data-testid="video-bank">
      <h2 className="font-display text-lg font-bold">Minutos de vídeo do mês</h2>
      {v.cap === 0 ? (
        <p className="text-sm text-muted-foreground">O seu plano não inclui vídeo.</p>
      ) : (
        <>
          <Progress value={v.pct} tone={v.level === "ok" ? "primary" : "gold"} />
          <p className="text-sm"><strong>{v.remaining.toLocaleString("pt-BR")}</strong> de {v.cap.toLocaleString("pt-BR")} minutos restantes <span className="text-muted-foreground">({v.pct}% usado)</span></p>
          {v.level === "warn" && <p className="text-sm text-gold-ink" role="status">Os minutos estão acabando. Reuniões em andamento terminam normalmente, mas novas só abrem se houver saldo.</p>}
          {v.level === "out" && <p className="text-sm text-[hsl(var(--danger))]" role="status">Os minutos deste mês acabaram. O saldo volta no início do próximo mês.</p>}
          <p className="text-xs text-muted-foreground">Cada pessoa conectada gasta 1 minuto por minuto de reunião. Reuniões com até 100 pessoas e 90 minutos; nada é gravado.</p>
        </>
      )}
    </Card>
  );
}

function ScheduleForm({ houseId, onDone, presetOrder }: { houseId: string; onDone: () => void; presetOrder?: string }) {
  const [kind, setKind] = useState<VideoKind>(presetOrder ? "consulta" : "reuniao");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [max, setMax] = useState("50");
  const [orderId, setOrderId] = useState(presetOrder ?? "");
  const [orders, setOrders] = useState<{ id: string; title: string; clientName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState<"todos" | "escolher">("todos");
  const [members, setMembers] = useState<HouseMemberOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [waiting, setWaiting] = useState(false);
  useEffect(() => { if (kind === "consulta") void fetchConsultOrders(houseId).then(setOrders); }, [kind, houseId]);
  useEffect(() => { if (kind === "reuniao" && audience === "escolher" && members === null) void fetchHouseMembers(houseId).then(setMembers); }, [kind, audience, members, houseId]);
  const shown = useMemo(() => (members ?? []).filter((m) => `${m.name} ${m.bond}`.toLowerCase().includes(q.trim().toLowerCase())), [members, q]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = async () => {
    const startsAtIso = localToIso(date, time);
    const err = validateSchedule({ kind, title, startsAtIso, duration, max, orderId, audience, invitees: picked });
    if (err) return void toast.error(err);
    setBusy(true);
    const r = await scheduleMeeting({ houseId, kind, title: title.trim(), startsAt: startsAtIso as string, durationMin: Number(duration), max: kind === "consulta" ? 2 : audience === "escolher" ? Math.max(2, picked.length + 1) : Number(max), orderId: kind === "consulta" ? orderId : null, invitees: kind === "reuniao" && audience === "escolher" ? picked : null, waiting: kind === "reuniao" && waiting });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Não consegui marcar.");
    toast.success(kind === "consulta" ? "Consulta marcada. O cliente foi avisado." : "Reunião marcada. Os convidados foram avisados.");
    setTitle(""); setDate(""); setTime(""); setOrderId(""); setPicked([]); setAudience("todos"); setQ(""); setWaiting(false);
    onDone();
  };
  return (
    <Card className="space-y-3 p-5" data-testid="video-form">
      <h2 className="font-display text-lg font-bold">Marcar reunião</h2>
      <div>
        <Label htmlFor="vd-kind">Tipo</Label>
        <select id="vd-kind" value={kind} onChange={(e) => setKind(e.target.value as VideoKind)} className={selectCls}>
          {(["reuniao", "consulta"] as VideoKind[]).map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="vd-title">Título</Label>
        <Input id="vd-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={kind === "reuniao" ? "Ex.: Encontro de membros" : "Ex.: Consulta de orientação"} />
      </div>
      {kind === "consulta" && (
        <div>
          <Label htmlFor="vd-order">Pedido do cliente</Label>
          <select id="vd-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className={selectCls}>
            <option value="">Escolha…</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.clientName} — {o.title}</option>)}
          </select>
          {orders.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Não há pedidos pagos em andamento. A consulta é sempre ligada a um pedido já pago.</p>}
        </div>
      )}
      {kind === "reuniao" && (
        <fieldset className="space-y-2" data-testid="video-audience">
          <legend className="text-sm font-medium">Quem participa</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["todos", "Todos os membros"], ["escolher", "Escolher pessoas"]] as const).map(([v, label]) => (
              <label key={v} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] border px-3 text-center text-sm font-semibold ${audience === v ? "border-primary bg-primary/10 text-primary" : "border-input bg-card"}`}>
                <input type="radio" name="vd-audience" className="sr-only" checked={audience === v} onChange={() => setAudience(v)} />{label}
              </label>
            ))}
          </div>
          {audience === "escolher" && (
            <div className="space-y-2 rounded-[14px] border border-border p-3" data-testid="video-picker">
              <Input aria-label="Buscar membro" placeholder="Buscar membro…" value={q} onChange={(e) => setQ(e.target.value)} />
              {members === null ? <p className="text-sm text-muted-foreground" role="status">Carregando membros…</p>
                : members.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum membro com conta. Convide membros pela página de membros da casa.</p>
                : (
                  <>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span data-testid="video-picked-count" aria-live="polite">{picked.length} {picked.length === 1 ? "pessoa escolhida" : "pessoas escolhidas"}</span>
                      <span className="flex gap-3">
                        <button type="button" className="min-h-8 font-semibold text-primary" onClick={() => setPicked((p) => [...new Set([...p, ...shown.map((m) => m.userId)])])}>Marcar {q.trim() ? "os encontrados" : "todos"}</button>
                        <button type="button" className="min-h-8 font-semibold text-muted-foreground" onClick={() => setPicked([])}>Limpar</button>
                      </span>
                    </div>
                    <ul className="max-h-56 divide-y divide-border overflow-y-auto" aria-label="Membros da casa">
                      {shown.map((m) => (
                        <li key={m.userId}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 text-sm">
                            <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={picked.includes(m.userId)} onChange={() => toggle(m.userId)} />
                            <span className="min-w-0 flex-1 break-words">{m.name}{m.bond && <span className="ml-1 text-xs text-muted-foreground">· {m.bond}</span>}</span>
                          </label>
                        </li>
                      ))}
                      {shown.length === 0 && <li className="py-2 text-sm text-muted-foreground">Ninguém encontrado.</li>}
                    </ul>
                  </>
                )}
              <p className="text-xs text-muted-foreground">Só as pessoas escolhidas recebem o aviso e conseguem entrar na sala.</p>
            </div>
          )}
        </fieldset>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="vd-date">Dia</Label><Input id="vd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label htmlFor="vd-time">Hora</Label><Input id="vd-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div><Label htmlFor="vd-dur">Duração (min)</Label><Input id="vd-dur" type="number" min={5} max={90} value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
        {kind === "reuniao" && audience === "todos" && <div><Label htmlFor="vd-max">Máx. de pessoas</Label><Input id="vd-max" type="number" min={2} max={100} value={max} onChange={(e) => setMax(e.target.value)} /></div>}
      </div>
      {kind === "reuniao" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" data-testid="video-waiting-opt">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[hsl(var(--primary))]" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} />
          <span><strong>Sala de espera</strong><span className="block text-xs text-muted-foreground">Cada pessoa espera e você (ou quem você indicar) libera a entrada, uma a uma ou em grupo.</span></span>
        </label>
      )}
      <Button onClick={() => void submit()} disabled={busy}>{busy ? "Marcando…" : "Marcar reunião"}</Button>
    </Card>
  );
}

function MeetingRow({ m, onCancel }: { m: UpcomingMeeting; onCancel: (m: UpcomingMeeting) => void }) {
  const phase = meetingPhase({ starts_at: m.startsAt, duration_min: m.durationMin });
  const [open, setOpen] = useState<"equipe" | "presenca" | null>(null);
  const canReport = m.role === "dono" || m.role === "coanfitriao";
  return (
    <li className="space-y-2 py-3" data-testid="video-row">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-semibold">{m.title}</div>
          <div className="text-xs text-muted-foreground">{formatWhen(m.startsAt)} · {m.durationMin} min · {m.houseName}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone={m.kind === "reuniao" ? "primary" : "plum"}>{KINDS[m.kind]}</Badge>
            {m.role !== "dono" && m.role !== "participante" && <Badge tone="gold">{ROLE_LABEL[m.role]}</Badge>}
            {m.waitingRoom && <Badge tone="muted">Sala de espera</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.isHost && m.kind !== "consulta" && <Button variant="outline" size="sm" onClick={() => setOpen(open === "equipe" ? null : "equipe")} aria-expanded={open === "equipe"} data-testid="video-team-toggle">Equipe</Button>}
          {canReport && <Button variant="outline" size="sm" onClick={() => setOpen(open === "presenca" ? null : "presenca")} aria-expanded={open === "presenca"} data-testid="video-presence-toggle">Presença</Button>}
          {m.isHost && m.kind !== "atividade" && phase === "cedo" && <Button variant="outline" size="sm" onClick={() => onCancel(m)}>Cancelar</Button>}
          {phase === "aberta" ? <Link to={`/reunioes/${m.id}`} className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground">Entrar</Link>
            : <span className="self-center text-xs text-muted-foreground">{phase === "cedo" ? "Abre 10 min antes" : "Encerrada"}</span>}
        </div>
      </div>
      {open === "equipe" && <HelpersEditor meetingId={m.id} houseId={m.houseId} />}
      {open === "presenca" && <PresenceReport meetingId={m.id} title={m.title} />}
    </li>
  );
}

/** Histórico de presença (12 meses): a dona vê as reuniões passadas, quantos compareceram e abre o relatório de cada uma. */
function History({ houseId }: { houseId: string }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { let alive = true; void fetchHistory(houseId).then((r) => { if (alive) setRows(r); }); return () => { alive = false; }; }, [houseId]);
  if (rows !== null && rows.length === 0) return null;
  return (
    <Card className="space-y-1 p-5" data-testid="video-history">
      <h2 className="font-display text-lg font-bold">Histórico e presença</h2>
      <p className="text-xs text-muted-foreground">Reuniões e atividades dos últimos 12 meses. Depois desse prazo os registros de presença são apagados.</p>
      {rows === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
        <ul className="divide-y divide-border">
          {rows.map((h) => (
            <li key={h.id} className="space-y-2 py-3" data-testid="video-history-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="break-words font-semibold">{h.title}</div><div className="text-xs text-muted-foreground">{formatWhen(h.startsAt)} · {KINDS[h.kind]} · {h.present} de {h.expected} esperados compareceram · {h.minutes.toLocaleString("pt-BR")} min</div></div>
                <Button variant="outline" size="sm" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>Ver presença</Button>
              </div>
              {open === h.id && <PresenceReport meetingId={h.id} title={h.title} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Reuniões por vídeo: todos veem as próximas e entram; a dona da casa vê o banco de minutos e marca ou cancela. */
export default function Reunioes() {
  const { currentUser, isRemoteAuth } = useApp();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const presetOrder = /^[0-9a-f-]{36}$/i.test(params.get("pedido") ?? "") ? (params.get("pedido") as string) : undefined;
  const isHouse = currentUser?.type === "commercial";
  const [list, setList] = useState<UpcomingMeeting[] | null>(null);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [bank, setBank] = useState<VideoBank | null>(null);
  const reload = useCallback(async () => {
    setList(await fetchUpcoming());
    if (isHouse && currentUser) {
      const id = await houseIdOf(currentUser.id);
      setHouseId(id);
      setBank(id ? await fetchBank(id) : null);
    }
  }, [isHouse, currentUser]);
  useEffect(() => { void reload(); }, [reload]);
  const cancel = async (m: UpcomingMeeting) => {
    if (!(await confirm({ title: "Cancelar esta reunião?", message: "Quem foi convidado deixa de vê-la.", confirmLabel: "Cancelar reunião", danger: true }))) return;
    if (await cancelMeeting(m.id)) { toast.success("Reunião cancelada."); void reload(); } else toast.error("Não consegui cancelar.");
  };
  const ordered = useMemo(() => list ?? [], [list]);
  if (!currentUser || !isRemoteAuth) return <Navigate to="/" replace />;
  const canSchedule = isHouse && houseId && bank?.enabled && bankView(bank).cap > 0;
  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-5">
        <div className="flex items-center gap-2"><Video className="h-5 w-5 text-primary" aria-hidden /><h1 className="break-words font-display text-2xl font-bold">Reuniões por vídeo</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Reuniões da casa com os membros e consultas por vídeo. A sala abre 10 minutos antes do horário, e nada é gravado.</p>
      </Card>
      {isHouse && bank && bank.enabled && <Bank bank={bank} />}
      {isHouse && bank && !bank.enabled && <Card className="p-5 text-sm text-muted-foreground">O vídeo ainda não está liberado para a sua casa.</Card>}
      {canSchedule && houseId && <ScheduleForm houseId={houseId} presetOrder={presetOrder} onDone={() => void reload()} />}
      <Card className="space-y-1 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><CalendarClock className="h-5 w-5 text-primary" aria-hidden />Próximas reuniões</h2>
        {list === null ? <p className="text-sm text-muted-foreground">Carregando…</p>
          : ordered.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma reunião marcada por enquanto.</p>
          : <ul className="divide-y divide-border">{ordered.map((m) => <MeetingRow key={m.id} m={m} onCancel={(x) => void cancel(x)} />)}</ul>}
      </Card>
      {isHouse && houseId && bank?.enabled && <History houseId={houseId} />}
    </div>
  );
}
