import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Textarea } from "@/components/base";
import ChatAttachment from "@/components/chat/ChatAttachment";
import {
  adminAccountAction, adminDecide, adminDossier, adminIdentity, adminQueue, adminRefreshFacts, adminReply, adminRequestVersion, adminSetEmail, adminSetStatus,
  adminSuspend, adminUnsuspend, supportEmail, type Dossier, type Party, type QueueRow,
} from "@/lib/support";
import { DECISION_LABEL, STATUS_LABEL, isClosed, kindLabel, priorityText, sortQueue, validateSupportEmail } from "@/lib/supportCore.js";

const when = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const PRI_TONE = { urgente: "danger", alta: "gold", normal: "muted" } as const;

/** Seção "Suporte" do painel: fila por prioridade, dossiê com fatos reais, resposta por canal, decisão e ferramentas de conta. */
export default function AdminSupport() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [closedView, setClosedView] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminQueue(closedView ? "resolvido" : null);
    if (r.ok) { setRows(sortQueue(r.data)); setError(null); } else setError(r.error);
  }, [closedView]);
  useEffect(() => { void load(); }, [load]);

  if (open) return <CaseDossier id={open} onBack={() => { setOpen(null); void load(); }} />;

  return (
    <div className="space-y-4">
      <EmailCard />
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-lg">Chamados {!closedView && rows.length > 0 && <span className="text-sm text-muted-foreground">({rows.length} abertos)</span>}</h2>
          <Button size="sm" variant="outline" onClick={() => setClosedView((v) => !v)}>{closedView ? "Ver abertos" : "Ver resolvidos"}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!error && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum chamado {closedView ? "resolvido" : "aberto"}.</p>}
        {rows.map((c) => (
          <button key={c.id} onClick={() => setOpen(c.id)} className="block w-full text-left rounded-lg border border-border/70 p-3 hover:bg-muted/50">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={PRI_TONE[c.priority as keyof typeof PRI_TONE] ?? "muted"}>{c.priority}</Badge>
              {c.overdue && <Badge tone="danger">prazo vencido</Badge>}
              <span className="font-semibold text-sm break-words [overflow-wrap:anywhere] min-w-0">{c.title}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {kindLabel(c.kind)} · {STATUS_LABEL[c.status] ?? c.status} · {c.opener_name ?? "—"}{c.subject_name ? ` → ${c.subject_name}` : ""}{c.house_name ? ` · ${c.house_name}` : ""} · 1ª resposta até {when(c.first_response_due)}
            </div>
          </button>
        ))}
      </Card>
    </div>
  );
}

function EmailCard() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void supportEmail().then((e) => { setSaved(e); setEmail(e ?? ""); }); }, []);
  const save = async () => {
    const bad = validateSupportEmail(email);
    if (bad) return void toast.error(bad);
    if (reason.trim().length < 10) return void toast.error("Informe o motivo da troca (10 letras ou mais).");
    setBusy(true);
    const r = await adminSetEmail(email, reason);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setSaved(email.trim().toLowerCase() || null); setReason("");
    toast.success(email.trim() ? "E-mail de suporte salvo." : "E-mail de suporte removido.");
  };
  return (
    <Card className="p-5 space-y-2">
      <h2 className="font-display font-bold text-lg">E-mail de suporte</h2>
      <p className="text-xs text-muted-foreground">{saved ? `Hoje a página Suporte mostra: ${saved}` : "Vazio: a página Suporte não mostra e-mail. Preencha quando o e-mail oficial existir."}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="email" aria-label="E-mail de suporte" placeholder="suporte@seudominio.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
        <Input aria-label="Motivo da troca" placeholder="Motivo da troca" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </div>
      <Button size="sm" onClick={() => void save()} disabled={busy}>Salvar</Button>
    </Card>
  );
}

function PartyCard({ title, p, caseId }: { title: string; p: Party | null; caseId: string }) {
  const [ident, setIdent] = useState<{ nome: string | null; email: string | null; guardada_ate: string } | null>(null);
  const look = async () => {
    const reason = window.prompt("Motivo da consulta da identidade retida (mín. 10 letras):") ?? "";
    if (reason.trim().length < 10) return;
    const r = await adminIdentity(p!.id, reason, caseId);
    if (r.ok) setIdent(r.data); else toast.error(r.error);
  };
  if (!p) return <div className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">{title}: —</div>;
  return (
    <div className="rounded-lg border border-border/70 p-3 text-sm space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="font-semibold">{p.nome} <span className="text-xs font-normal text-muted-foreground">({p.tipo_conta}{p.convidado ? ", convidado ao caso" : ""})</span></div>
      {p.excluida && (
        <div className="text-xs">
          <Badge tone="danger">conta excluída</Badge>
          {p.identidade_retida && <div className="mt-1">Identidade retida: {p.identidade_retida.nome ?? "(apagada pelo prazo)"} · {p.identidade_retida.email ?? "—"}</div>}
          {!ident && p.identidade_retida && <button className="text-primary font-semibold mt-1" onClick={() => void look()}>Registrar consulta e ver casas</button>}
          {ident && <div className="mt-1">Guardada até {when(ident.guardada_ate)}</div>}
        </div>
      )}
    </div>
  );
}

function Facts({ facts }: { facts: Record<string, unknown> }) {
  const conv = facts.conversa as { texto?: string; de?: string; at?: string; apagada?: boolean; assistente?: boolean; equipe?: string }[] | undefined;
  const rest = Object.entries(facts).filter(([k]) => k !== "conversa" && k !== "contexto");
  return (
    <div className="space-y-2 text-xs">
      {rest.map(([k, v]) => (
        <details key={k} className="rounded-md border border-border/60 p-2" open={k === "pedido" || k === "reserva" || k === "pagamentos"}>
          <summary className="cursor-pointer font-semibold capitalize">{k.replace(/_/g, " ")}</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] break-words text-[11px]">{JSON.stringify(v, null, 2)}</pre>
        </details>
      ))}
      {conv && conv.length > 0 && (
        <details className="rounded-md border border-border/60 p-2" open>
          <summary className="cursor-pointer font-semibold">Conversa (últimas {conv.length}, texto real)</summary>
          <div className="mt-1 space-y-1">
            {conv.map((m, i) => (
              <div key={i}><span className="text-muted-foreground">{when(m.at)}{m.assistente ? " · assistente" : ""}{m.apagada ? " · APAGADA pelo autor" : ""}:</span> {m.texto}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CaseDossier({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"autor" | "envolvido" | "interna">("autor");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [decision, setDecision] = useState("procedente");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFirst, setShowFirst] = useState(false);

  const load = useCallback(async () => {
    const r = await adminDossier(id, "Análise do chamado");
    if (r.ok) setD(r.data); else setError(r.error);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Card className="p-5"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={onBack}>Voltar</Button></Card>;
  if (!d) return <Card className="p-5 text-sm text-muted-foreground">Abrindo dossiê…</Card>;

  const c = d.caso;
  const closed = isClosed(c.status);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
    toast.success(okMsg);
    await load();
  };
  const ask = (q: string, min = 5) => { const v = window.prompt(q) ?? ""; return v.trim().length >= min ? v.trim() : null; };
  const lastFacts = d.fatos[d.fatos.length - 1];
  const firstFacts = d.fatos[0];

  const userAction = async (action: "send_password_reset" | "resend_confirmation" | "account_state", userId: string) => {
    const reason = ask("Motivo (mín. 5 letras):"); if (!reason) return;
    setBusy(true);
    const r = await adminAccountAction(action, userId, reason, id);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(action === "account_state" ? `Conta: ${JSON.stringify(r.data)}` : `E-mail enviado para ${String(r.data.enviado_para ?? "")}.`);
    await load();
  };
  const people = [d.autor, d.envolvido].filter((p): p is Party => Boolean(p && !p.excluida));

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <button className="text-sm text-primary font-semibold" onClick={onBack}>← Fila</button>
        <h2 className="font-display font-bold text-xl">{c.title}</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={PRI_TONE[c.priority as keyof typeof PRI_TONE] ?? "muted"}>{priorityText(c.kind, c.priority)}</Badge>
          <Badge tone="primary">{STATUS_LABEL[c.status] ?? c.status}</Badge><Badge>{kindLabel(c.kind)}</Badge>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{c.description}</p>
        {c.decision && <p className="text-sm font-semibold">Decisão: {DECISION_LABEL[c.decision] ?? c.decision}</p>}
        <div className="grid gap-2 sm:grid-cols-2"><PartyCard title="Autor do relato" p={d.autor} caseId={id} /><PartyCard title="Envolvido" p={d.envolvido} caseId={id} /></div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-lg">Fatos da plataforma</h3>
          <div className="flex gap-2">
            {d.fatos.length > 1 && <Button size="sm" variant="ghost" onClick={() => setShowFirst((v) => !v)}>{showFirst ? "Ver mais recente" : "Ver primeira coleta"}</Button>}
            {!closed && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const r = ask("Motivo para atualizar os fatos (mín. 5 letras):"); if (r) void run(() => adminRefreshFacts(id, r), "Fatos atualizados (a coleta anterior continua guardada)."); }}>Atualizar fatos</Button>}
          </div>
        </div>
        {(showFirst ? firstFacts : lastFacts) ? <><div className="text-[11px] text-muted-foreground">Coletado em {when((showFirst ? firstFacts : lastFacts).em)}</div><Facts facts={(showFirst ? firstFacts : lastFacts).fatos} /></> : <p className="text-sm text-muted-foreground">Sem item ligado ao relato.</p>}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-display font-bold text-lg">Versões das partes</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["autor", "envolvido"] as const).map((ch) => (
            <div key={ch} className="rounded-lg border border-border/70 p-3 space-y-1 text-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{ch === "autor" ? "Canal do autor" : "Canal do envolvido"}</div>
              {d.mensagens.filter((m) => m.canal === ch).map((m) => <div key={m.id}><span className="text-[11px] text-muted-foreground">{m.papel === "parte" ? "Pessoa" : "Equipe"} · {when(m.em)}</span><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.texto}</p></div>)}
              {d.mensagens.every((m) => m.canal !== ch) && <p className="text-muted-foreground">Sem mensagens.</p>}
              {d.provas.filter((p) => p.canal === ch).map((p) => <div key={p.id}><ChatAttachment bucket="report-evidence" path={p.path} type={/\.pdf$/i.test(p.path) ? "application/pdf" : "image/jpeg"} name={p.nota ?? "Prova"} /><div className="text-[11px] text-muted-foreground">{p.nota} · enviada por escolha em {when(p.consentimento_em)}</div></div>)}
            </div>
          ))}
        </div>
        {d.mensagens.some((m) => m.canal === "interna") && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas internas</div>{d.mensagens.filter((m) => m.canal === "interna").map((m) => <p key={m.id} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.texto}</p>)}</div>
        )}
      </Card>

      {!closed && (
        <Card className="p-5 space-y-3">
          <h3 className="font-display font-bold text-lg">Responder e decidir</h3>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Canal" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              <option value="autor">Para o autor</option><option value="envolvido">Para o envolvido</option><option value="interna">Nota interna</option>
            </select>
          </div>
          <Textarea rows={3} aria-label="Resposta" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          <Button size="sm" disabled={busy || body.trim().length < 2} onClick={() => void run(async () => { const r = await adminReply(id, channel, body); if (r.ok) setBody(""); return r; }, "Enviado.")}>Enviar</Button>

          <div className="border-t border-border/60 pt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Pedir a versão do envolvido: escreva um resumo neutro (sem revelar quem relatou). Ele é notificado e passa a ver só esse resumo.</p>
            <Textarea rows={2} aria-label="Resumo neutro" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} />
            <Button size="sm" variant="outline" disabled={busy || summary.trim().length < 10} onClick={() => void run(async () => { const r = await adminRequestVersion(id, summary); if (r.ok) setSummary(""); return r; }, "Pedido enviado ao envolvido.")}>Pedir versão do envolvido</Button>
          </div>

          <div className="border-t border-border/60 pt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {(["em_analise", "aguardando_pessoa", "aguardando_envolvido"] as const).map((s) => <Button key={s} size="sm" variant="ghost" disabled={busy || c.status === s} onClick={() => { const r = ask("Motivo (mín. 5 letras):"); if (r) void run(() => adminSetStatus(id, s, r), "Estado atualizado."); }}>{STATUS_LABEL[s]}</Button>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Decisão" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={decision} onChange={(e) => setDecision(e.target.value)}>
                {Object.entries(DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <Textarea rows={3} aria-label="Motivo da decisão" placeholder="Motivo da decisão (aparece para o autor)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || note.trim().length < 10} onClick={() => void run(() => adminDecide(id, decision, note, false), "Chamado encerrado.")}>Decidir e encerrar</Button>
              <Button size="sm" variant="outline" disabled={busy || note.trim().length < 10} onClick={() => void run(() => adminDecide(id, decision, note, true), "Chamado encerrado sem ação.")}>Recusar</Button>
            </div>
          </div>
        </Card>
      )}

      {people.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="font-display font-bold text-lg">Ferramentas de conta</h3>
          <p className="text-xs text-muted-foreground">Cada ação exige motivo e fica no registro. O e-mail de recuperação sempre vai para o e-mail da própria conta; não é possível trocar e-mail nem definir senha por aqui.</p>
          {people.map((p) => (
            <div key={p.id} className="rounded-lg border border-border/70 p-3 space-y-2">
              <div className="text-sm font-semibold">{p.nome}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void userAction("account_state", p.id)}>Ver estado da conta</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void userAction("send_password_reset", p.id)}>Enviar recuperação de senha</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void userAction("resend_confirmation", p.id)}>Reenviar confirmação</Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => { const r = ask("Motivo da suspensão (mín. 10 letras):", 10); if (r) void run(() => adminSuspend(p.id, r, id), "Conta suspensa."); }}>Suspender</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const r = ask("Motivo da reativação (mín. 10 letras):", 10); if (r) void run(() => adminUnsuspend(p.id, r), "Conta reativada."); }}>Reativar</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5 space-y-2">
        <h3 className="font-display font-bold text-lg">Registro do caso</h3>
        {d.registro.map((l, i) => <div key={i} className="text-xs"><span className="text-muted-foreground">{when(l.em)}</span> · <strong>{l.acao.replace(/_/g, " ")}</strong>{l.motivo ? ` — ${l.motivo}` : ""}</div>)}
      </Card>
    </div>
  );
}
