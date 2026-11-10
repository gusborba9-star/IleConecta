import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Headset, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/base";
import ChatAttachment from "@/components/chat/ChatAttachment";
import HandoffBar from "@/components/chat/HandoffBar";
import { fetchHandoff } from "@/lib/handoff";
import type { Handoff } from "@/lib/handoffCore";
import { useApp } from "@/contexts/AppContext";
import { fetchCampaigns, fetchTopics, type Campaign, type Count } from "@/lib/campaigns";
import { isPlaceholderText } from "@/lib/chatFiles";
import { kindLabel } from "@/lib/calendarCore";
import { fetchMembersOverview, type MembersOverview } from "@/lib/members";
import {
  addStaffDate, fetchMyStaffLink, fetchStaffConversations, fetchStaffDates, fetchStaffMessages, fetchStaffOrders, hasPerm, removeStaffDate, staffPost, staffSend,
  type PermKey, type StaffConversation, type StaffDate, type StaffLink, type StaffMessage, type StaffOrder,
} from "@/lib/staff";
import { cn, formatBRL, timeAgo } from "@/lib/utils";

const STATUS: Record<string, string> = { aguardando_pagamento: "Aguardando pagamento", confirmado: "Confirmado", em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const SITUATION: Record<string, string> = { vencida: "Em atraso", perto: "Vence em breve", em_dia: "Em dia", sem_mensalidade: "Sem mensalidade" };
const TABS: { id: string; label: string; perm: PermKey }[] = [
  { id: "chat", label: "Conversas", perm: "chat_read" },
  { id: "orders", label: "Pedidos", perm: "orders" },
  { id: "post", label: "Publicar", perm: "post" },
  { id: "calendar", label: "Agenda", perm: "calendar" },
  { id: "members", label: "Membros", perm: "members" },
  { id: "stats", label: "Números", perm: "stats" },
];

function Conversations({ link }: { link: StaffLink }) {
  const [convs, setConvs] = useState<StaffConversation[]>([]);
  const [open, setOpen] = useState<StaffConversation | null>(null);
  const [msgs, setMsgs] = useState<StaffMessage[]>([]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const canReply = hasPerm(link.perms, "chat_reply");

  useEffect(() => {
    void fetchStaffConversations().then(setConvs);
  }, []);
  const loadThread = useCallback(async (c: StaffConversation) => {
    setMsgs(await fetchStaffMessages(c.id));
    setHandoff(await fetchHandoff(c.id));
  }, []);
  useEffect(() => {
    if (!open) return;
    void loadThread(open);
    const t = window.setInterval(() => document.visibilityState === "visible" && void loadThread(open), 8000);
    return () => window.clearInterval(t);
  }, [open, loadThread]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length]);

  const send = async () => {
    if (!open || !text.trim() || busy) return;
    setBusy(true);
    const err = await staffSend(open.id, text);
    setBusy(false);
    if (err) return void toast.error(err);
    setText("");
    await loadThread(open);
  };

  if (!open)
    return (
      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Conversas</h2>
        {convs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
        <ul className="space-y-2">
          {convs.map((c) => (
            <li key={c.id}><button type="button" onClick={() => setOpen(c)} className="lift w-full text-left rounded-2xl border border-border bg-muted/30 p-3">
              <div className="flex justify-between gap-2"><span className="font-semibold truncate">{c.otherName}</span><span className="text-[11px] text-muted-foreground shrink-0">{c.lastAt && timeAgo(c.lastAt)}</span></div>
              <div className="text-sm text-muted-foreground truncate">{c.lastText}</div>
            </button></li>
          ))}
        </ul>
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button size="icon" variant="ghost" aria-label="Voltar às conversas" onClick={() => setOpen(null)}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="font-semibold">{open.otherName}</div>
      </div>
      <HandoffBar conversationId={open.id} handoff={handoff} viewer="house" canAct={canReply} onChange={() => void loadThread(open)} />
      <div ref={listRef} className="h-[50dvh] overflow-y-auto p-3 space-y-2">
        {msgs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.fromHouse ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap", m.fromHouse ? "bg-forest text-forest-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md")}>
              {m.fromHouse && <div className="text-[10px] font-semibold opacity-80 mb-0.5">{m.fromAssistant ? "Assistente da casa" : m.staffName ? `Atendido por ${m.staffName}` : "Casa"}</div>}
              {m.attachmentPath && m.attachmentType && <div className="mb-1"><ChatAttachment path={m.attachmentPath} type={m.attachmentType} name={m.attachmentName ?? "arquivo"} size={m.attachmentSize} /></div>}
              {!(m.attachmentPath && isPlaceholderText(m.text)) && m.text}
              <div className={cn("text-[10px] mt-1", m.fromHouse ? "text-right opacity-70" : "text-muted-foreground")}>{timeAgo(m.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      {canReply ? (
        <div className="flex items-center gap-2 border-t border-border p-3">
          <input aria-label="Mensagem" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Responder pela casa" className="h-11 flex-1 min-w-0 rounded-[14px] border border-input bg-card px-4 text-sm" />
          <Button size="icon" aria-label="Enviar" disabled={busy || !text.trim()} onClick={() => void send()}><Send className="h-4 w-4" /></Button>
        </div>
      ) : <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">Seu acesso não inclui responder.</p>}
    </Card>
  );
}

function Orders() {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  useEffect(() => {
    void fetchStaffOrders().then(setOrders);
  }, []);
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Pedidos</h2>
      {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p> : (
        <ul className="divide-y divide-border">
          {orders.map((o) => (
            <li key={o.id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0"><div className="font-semibold truncate">{o.title}</div><div className="text-xs text-muted-foreground">{o.clientName} · {timeAgo(o.createdAt)}</div></div>
              <Badge tone="muted">{STATUS[o.status] ?? o.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Publish({ staffName }: { staffName: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    const err = await staffPost(text);
    setBusy(false);
    if (err) return void toast.error(err);
    setText("");
    toast.success("Publicado na comunidade.");
  };
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Publicar na comunidade</h2>
      <p className="text-sm text-muted-foreground">O texto sai no nome da casa. Fica registrado que foi publicado por {staffName}.</p>
      <Textarea aria-label="Texto da publicação" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="O que a casa quer compartilhar" />
      <Button disabled={busy || !text.trim()} onClick={() => void publish()}>{busy ? "Publicando…" : "Publicar"}</Button>
    </Card>
  );
}

function Agenda() {
  const [dates, setDates] = useState<StaffDate[]>([]);
  const [f, setF] = useState({ title: "", kind: "gira", date: "", time: "", note: "", isPublic: true });
  const load = useCallback(async () => setDates(await fetchStaffDates()), []);
  useEffect(() => {
    void load();
  }, [load]);
  const add = async () => {
    const err = await addStaffDate(f);
    if (err) return void toast.error(err);
    setF({ title: "", kind: "gira", date: "", time: "", note: "", isPublic: true });
    toast.success("Data adicionada.");
    await load();
  };
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-display font-bold text-lg">Agenda da casa</h2>
      {dates.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma data marcada.</p> : (
        <ul className="divide-y divide-border">
          {dates.map((d) => (
            <li key={d.id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0"><div className="font-semibold truncate">{d.title} <Badge tone="muted" className="ml-1">{kindLabel(d.kind)}</Badge></div>
                <div className="text-xs text-muted-foreground">{d.date.split("-").reverse().join("/")}{d.time ? ` · ${d.time}` : ""} · {d.isPublic ? "Público" : "Só a casa"}</div></div>
              <Button size="sm" variant="ghost" aria-label={`Remover ${d.title}`} onClick={async () => { if (await removeStaffDate(d.id)) await load(); else toast.error("Não foi possível remover."); }}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="ag-t">Nome da data</Label><Input id="ag-t" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><Label htmlFor="ag-k">Tipo</Label>
          <select id="ag-k" className="h-11 w-full rounded-[14px] border border-input bg-card px-3 text-sm" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {["gira", "obrigacao", "celebracao", "outro"].map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select></div>
        <div><Label htmlFor="ag-d">Data</Label><Input id="ag-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><Label htmlFor="ag-h">Horário (opcional)</Label><Input id="ag-h" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} /> Mostrar ao público</label>
        <div className="sm:col-span-2"><Label htmlFor="ag-n">Observação (opcional)</Label><Textarea id="ag-n" rows={2} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <Button disabled={f.title.trim().length < 2 || !f.date} onClick={() => void add()}>Adicionar na agenda</Button>
    </Card>
  );
}

function Members() {
  const [data, setData] = useState<MembersOverview | null | undefined>(undefined);
  useEffect(() => {
    void fetchMembersOverview().then(setData);
  }, []);
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Membros</h2>
      <p className="text-xs text-muted-foreground">Só leitura: você vê quem está em dia, sem alterar nada.</p>
      {data === undefined ? <div className="h-16" aria-busy /> : !data || data.members.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum membro cadastrado.</p> : (
        <>
          <p className="text-sm">{data.summary.total} membros · {data.summary.vencidas} em atraso · {data.summary.perto} vencem em breve</p>
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0"><div className="font-semibold truncate">{m.name}</div><div className="text-xs text-muted-foreground">{m.monthlyCents ? `${formatBRL(m.monthlyCents / 100)} · dia ${m.dueDay}` : "Sem mensalidade"}</div></div>
                <Badge tone={m.situation === "vencida" ? "danger" : m.situation === "perto" ? "gold" : "muted"}>{SITUATION[m.situation] ?? m.situation}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Stats() {
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [topics, setTopics] = useState<Count[]>([]);
  useEffect(() => {
    void fetchCampaigns().then(setCamps);
    void fetchTopics().then(setTopics);
  }, []);
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-display font-bold text-lg">Números da divulgação</h2>
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">Links</div>
        {camps.length === 0 ? <p className="text-sm text-muted-foreground">A casa ainda não criou links.</p> : (
          <ul className="divide-y divide-border">{camps.map((c) => <li key={c.id} className="py-2 flex justify-between gap-2 text-sm"><span className="truncate">{c.label}</span><span className="text-muted-foreground shrink-0">{c.visits} visitas · {c.contacts} quiseram falar</span></li>)}</ul>
        )}
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">Assuntos mais procurados · 30 dias</div>
        {topics.length === 0 ? <p className="text-sm text-muted-foreground">Ainda sem conversas suficientes.</p> : (
          <ul className="divide-y divide-border">{topics.map((t) => <li key={t.label} className="py-2 flex justify-between gap-2 text-sm"><span>{t.label}</span><strong>{t.total}</strong></li>)}</ul>
        )}
      </div>
    </Card>
  );
}

/** Atendimento da casa, para o login vinculado: só aparece o que o acesso principal liberou. */
export default function Atendimento() {
  const { currentUser, isRemoteAuth } = useApp();
  const [link, setLink] = useState<StaffLink | null | undefined>(undefined);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    if (!isRemoteAuth) return;
    void fetchMyStaffLink().then(setLink);
  }, [isRemoteAuth]);

  if (!currentUser) return <Navigate to="/login" replace />;
  if (link === undefined) return <div className="h-40" aria-busy />;
  if (link === null) return <Card className="p-6"><h1 className="font-display font-bold text-2xl">Atendimento da casa</h1><p className="text-sm text-muted-foreground mt-1">Você não atende por nenhuma casa agora. Se recebeu um convite, abra o link dele.</p></Card>;

  const tabs = TABS.filter((t) => hasPerm(link.perms, t.perm));
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Atendimento</div>
        <h1 className="font-display font-bold text-2xl flex items-start gap-2 mt-1"><Headset className="h-6 w-6 mt-1 shrink-0 text-primary" /> <span>{link.houseName}</span></h1>
        <p className="text-sm text-muted-foreground mt-1">Você atende como <strong>{link.staffName}</strong>. Aparece só o que a casa liberou para você.</p>
      </Card>

      {tabs.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">A casa ainda não liberou nenhuma ferramenta para você. Peça a ela para ligar o que você precisa.</Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Ferramentas liberadas">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={current?.id === t.id} onClick={() => setTab(t.id)}
                className={cn("h-10 px-4 rounded-[14px] text-sm font-semibold border whitespace-nowrap", current?.id === t.id ? "bg-forest text-white border-forest" : "bg-card border-input")}>{t.label}</button>
            ))}
          </div>
          {current?.id === "chat" && <Conversations link={link} />}
          {current?.id === "orders" && <Orders />}
          {current?.id === "post" && <Publish staffName={link.staffName} />}
          {current?.id === "calendar" && <Agenda />}
          {current?.id === "members" && <Members />}
          {current?.id === "stats" && <Stats />}
        </>
      )}
    </div>
  );
}
