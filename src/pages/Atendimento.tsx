import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Headset, Send } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import ChatAttachment from "@/components/chat/ChatAttachment";
import { useApp } from "@/contexts/AppContext";
import { isPlaceholderText } from "@/lib/chatFiles";
import {
  fetchMyStaffLink, fetchStaffConversations, fetchStaffMessages, fetchStaffOrders, staffSend,
  type StaffConversation, type StaffLink, type StaffMessage, type StaffOrder,
} from "@/lib/staff";
import { cn, timeAgo } from "@/lib/utils";

const STATUS: Record<string, string> = { aguardando_pagamento: "Aguardando pagamento", confirmado: "Confirmado", em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };

/** Atendimento da casa, para o login vinculado: só aparece o que o acesso principal liberou. */
export default function Atendimento() {
  const { currentUser, isRemoteAuth } = useApp();
  const [link, setLink] = useState<StaffLink | null | undefined>(undefined);
  const [convs, setConvs] = useState<StaffConversation[]>([]);
  const [open, setOpen] = useState<StaffConversation | null>(null);
  const [msgs, setMsgs] = useState<StaffMessage[]>([]);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRemoteAuth) return;
    void fetchMyStaffLink().then(setLink);
  }, [isRemoteAuth]);
  useEffect(() => {
    if (!link) return;
    void fetchStaffConversations().then(setConvs);
    if (link.canOrders) void fetchStaffOrders().then(setOrders);
  }, [link]);

  const loadThread = useCallback(async (c: StaffConversation) => setMsgs(await fetchStaffMessages(c.id)), []);
  useEffect(() => {
    if (!open) return;
    void loadThread(open);
    const t = window.setInterval(() => document.visibilityState === "visible" && void loadThread(open), 8000);
    return () => window.clearInterval(t);
  }, [open, loadThread]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length]);

  if (!currentUser) return <Navigate to="/login" replace />;
  if (link === undefined) return <div className="h-40" aria-busy />;
  if (link === null) return <Card className="p-6"><h1 className="font-display font-bold text-2xl">Atendimento da casa</h1><p className="text-sm text-muted-foreground mt-1">Você não atende por nenhuma casa agora. Se recebeu um convite, abra o link dele.</p></Card>;

  const send = async () => {
    if (!open || !text.trim() || busy) return;
    setBusy(true);
    const err = await staffSend(open.id, text);
    setBusy(false);
    if (err) return void toast.error(err);
    setText("");
    await loadThread(open);
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Atendimento</div>
        <h1 className="font-display font-bold text-2xl flex items-center gap-2 mt-1"><Headset className="h-6 w-6 text-primary" /> {link.houseName}</h1>
        <p className="text-sm text-muted-foreground mt-1">Você atende como <strong>{link.staffName}</strong>. {link.canReply ? "Seus clientes veem “Atendido por” com o seu nome." : "Seu acesso é só de leitura."}</p>
      </Card>

      {open ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Button size="icon" variant="ghost" aria-label="Voltar às conversas" onClick={() => setOpen(null)}><ArrowLeft className="h-4 w-4" /></Button>
            <div className="font-semibold">{open.otherName}</div>
          </div>
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
          {link.canReply ? (
            <div className="flex items-center gap-2 border-t border-border p-3">
              <input aria-label="Mensagem" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()}
                placeholder="Responder pela casa" className="h-11 flex-1 min-w-0 rounded-[14px] border border-input bg-card px-4 text-sm" />
              <Button size="icon" aria-label="Enviar" disabled={busy || !text.trim()} onClick={() => void send()}><Send className="h-4 w-4" /></Button>
            </div>
          ) : <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">Seu acesso não inclui responder.</p>}
        </Card>
      ) : (
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
      )}

      {link.canOrders && !open && (
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
      )}
    </div>
  );
}
