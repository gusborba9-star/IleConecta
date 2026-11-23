import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Video } from "lucide-react";
import { Badge, Button, Card, Input, Label, Progress } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { useApp } from "@/contexts/AppContext";
import { cancelMeeting, fetchBank, fetchConsultOrders, fetchUpcoming, scheduleMeeting, type UpcomingMeeting, type VideoBank } from "@/lib/video";
import { houseIdOf } from "@/lib/campaigns";
import { KINDS, bankView, formatWhen, localToIso, meetingPhase, validateSchedule, type VideoKind } from "@/lib/videoCore";

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

function ScheduleForm({ houseId, onDone }: { houseId: string; onDone: () => void }) {
  const [kind, setKind] = useState<VideoKind>("reuniao");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [max, setMax] = useState("50");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<{ id: string; title: string; clientName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (kind === "consulta") void fetchConsultOrders(houseId).then(setOrders); }, [kind, houseId]);
  const submit = async () => {
    const startsAtIso = localToIso(date, time);
    const err = validateSchedule({ kind, title, startsAtIso, duration, max, orderId });
    if (err) return void toast.error(err);
    setBusy(true);
    const r = await scheduleMeeting({ houseId, kind, title: title.trim(), startsAt: startsAtIso as string, durationMin: Number(duration), max: kind === "consulta" ? 2 : Number(max), orderId: kind === "consulta" ? orderId : null });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Não consegui marcar.");
    toast.success("Reunião marcada.");
    setTitle(""); setDate(""); setTime(""); setOrderId("");
    onDone();
  };
  return (
    <Card className="space-y-3 p-5" data-testid="video-form">
      <h2 className="font-display text-lg font-bold">Marcar reunião</h2>
      <div>
        <Label htmlFor="vd-kind">Tipo</Label>
        <select id="vd-kind" value={kind} onChange={(e) => setKind(e.target.value as VideoKind)} className={selectCls}>
          {(Object.keys(KINDS) as VideoKind[]).map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}
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
          {orders.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Não há pedidos em andamento. A consulta é sempre ligada a um pedido.</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="vd-date">Dia</Label><Input id="vd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label htmlFor="vd-time">Hora</Label><Input id="vd-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div><Label htmlFor="vd-dur">Duração (min)</Label><Input id="vd-dur" type="number" min={5} max={90} value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
        {kind === "reuniao" && <div><Label htmlFor="vd-max">Máx. de pessoas</Label><Input id="vd-max" type="number" min={2} max={100} value={max} onChange={(e) => setMax(e.target.value)} /></div>}
      </div>
      <Button onClick={() => void submit()} disabled={busy}>{busy ? "Marcando…" : "Marcar reunião"}</Button>
    </Card>
  );
}

function MeetingRow({ m, onCancel }: { m: UpcomingMeeting; onCancel: (m: UpcomingMeeting) => void }) {
  const phase = meetingPhase({ starts_at: m.startsAt, duration_min: m.durationMin });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="video-row">
      <div className="min-w-0">
        <div className="break-words font-semibold">{m.title}</div>
        <div className="text-xs text-muted-foreground">{formatWhen(m.startsAt)} · {m.durationMin} min · {m.houseName}</div>
        <Badge tone={m.kind === "consulta" ? "plum" : "primary"} className="mt-1">{KINDS[m.kind]}</Badge>
      </div>
      <div className="flex gap-2">
        {m.isHost && <Button variant="outline" size="sm" onClick={() => onCancel(m)}>Cancelar</Button>}
        {phase === "aberta" ? <Link to={`/reunioes/${m.id}`} className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground">Entrar</Link>
          : <span className="text-xs text-muted-foreground">{phase === "cedo" ? "Abre 10 min antes" : "Encerrada"}</span>}
      </div>
    </li>
  );
}

/** Reuniões por vídeo: todos veem as próximas e entram; a dona da casa vê o banco de minutos e marca ou cancela. */
export default function Reunioes() {
  const { currentUser, isRemoteAuth } = useApp();
  const confirm = useConfirm();
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
      {canSchedule && houseId && <ScheduleForm houseId={houseId} onDone={() => void reload()} />}
      <Card className="space-y-1 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><CalendarClock className="h-5 w-5 text-primary" aria-hidden />Próximas reuniões</h2>
        {list === null ? <p className="text-sm text-muted-foreground">Carregando…</p>
          : ordered.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma reunião marcada por enquanto.</p>
          : <ul className="divide-y divide-border">{ordered.map((m) => <MeetingRow key={m.id} m={m} onCancel={(x) => void cancel(x)} />)}</ul>}
      </Card>
    </div>
  );
}
