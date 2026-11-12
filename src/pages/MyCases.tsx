import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { Badge, Button, Card, Textarea } from "@/components/base";
import ChatAttachment from "@/components/chat/ChatAttachment";
import ReportOccurrence from "@/components/support/ReportOccurrence";
import { prepareFile, uploadFile } from "@/lib/chatFiles";
import { useApp } from "@/contexts/AppContext";
import { addCaseMessage, myCase, myCases, sendEvidence, type CaseDetail, type MyCase } from "@/lib/support";
import { DECISION_LABEL, EVIDENCE_CONSENT_TEXT, STATUS_LABEL, isClosed, kindLabel, priorityText } from "@/lib/supportCore.js";

const when = (s: string) => new Date(s).toLocaleString("pt-BR");

/** Meus chamados: lista, detalhe, conversa com a equipe e envio de provas (só se a pessoa escolher). */
export default function MyCases() {
  const { id } = useParams();
  const nav = useNavigate();
  const [rows, setRows] = useState<MyCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (id) return;
    void myCases().then((r) => (r.ok ? setRows(r.data) : setError(r.error)));
  }, [id]);

  if (id) return <CaseView id={id} onBack={() => nav("/suporte/chamados")} />;

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-primary" /><h1 className="font-display font-bold text-2xl">Meus chamados</h1></div>
        <Button onClick={() => setNewOpen(true)}>Relatar ocorrência</Button>
      </Card>
      <Card className="p-4 space-y-2">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!error && rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {rows?.length === 0 && <p className="text-sm text-muted-foreground">Você não tem chamados. Se algo der errado, use “Relatar ocorrência”.</p>}
        {rows?.map((c) => (
          <Link key={c.id} to={`/suporte/chamados/${c.id}`} className="block rounded-lg border border-border/70 p-3 hover:bg-muted/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sm break-words [overflow-wrap:anywhere] min-w-0">{c.title}</span>
              <Badge tone={isClosed(c.status) ? "muted" : c.status === "aguardando_pessoa" ? "gold" : "primary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{c.role === "envolvido" ? "Você foi citado neste caso" : kindLabel(c.kind)} · {when(c.created_at)}</div>
          </Link>
        ))}
      </Card>
      <ReportOccurrence open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function CaseView({ id, onBack }: { id: string; onBack: () => void }) {
  const { currentUser } = useApp();
  const [c, setC] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    const r = await myCase(id);
    if (r.ok) setC(r.data); else setError(r.error);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Card className="p-6 space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={onBack}>Voltar</Button></Card>;
  if (!c) return <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>;

  const closed = isClosed(c.status);
  const author = c.papel === "autor";

  const send = async () => {
    if (text.trim().length < 2) return;
    setBusy(true);
    const r = await addCaseMessage(id, text);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setText("");
    await load();
  };

  const upload = async () => {
    if (!file || !currentUser) return;
    if (!consent) return void toast.error("Marque a confirmação para enviar o arquivo.");
    setBusy(true);
    const prep = await prepareFile(file);
    const up = prep.ok ? await uploadFile("report-evidence", currentUser.id, prep.file) : null;
    if (!up) { setBusy(false); return void toast.error(prep.ok ? "Não foi possível enviar o arquivo." : (prep as { message: string }).message); }
    const r = await sendEvidence(id, up.path, note, true);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Arquivo enviado ao suporte.");
    setFile(null); setNote(""); setConsent(false);
    await load();
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-5 space-y-2">
        <button className="text-sm text-primary font-semibold" onClick={onBack}>← Meus chamados</button>
        <h1 className="font-display font-bold text-xl break-words [overflow-wrap:anywhere]">{c.titulo}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="primary">{STATUS_LABEL[c.status] ?? c.status}</Badge>
          {author && <Badge tone="muted">{kindLabel(c.tipo)}</Badge>}
          {author && !closed && <Badge tone="gold">{priorityText(c.tipo, c.prioridade)}</Badge>}
        </div>
        {c.resumo && <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{c.resumo}</p>}
        {!author && <p className="text-xs text-muted-foreground">Você foi citado em um caso. Conte a sua versão abaixo: a equipe decide ouvindo as duas partes, com os fatos registrados na plataforma.</p>}
        {author && !closed && c.prazo_primeira_resposta && <p className="text-xs text-muted-foreground">Primeira resposta até {when(c.prazo_primeira_resposta)}.</p>}
        {closed && c.decisao && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="font-semibold">Decisão: {DECISION_LABEL[c.decisao] ?? c.decisao}</div>
            {c.decisao_nota && <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{c.decisao_nota}</p>}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Conversa com a equipe</h2>
        {c.mensagens.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem mensagens.</p>}
        {c.mensagens.map((m) => (
          <div key={m.id} className={`rounded-lg p-3 text-sm ${m.de === "voce" ? "bg-primary/10 ml-6" : "bg-muted/50 mr-6"}`}>
            <div className="text-[11px] text-muted-foreground">{m.de === "voce" ? "Você" : "Equipe do Ilê Conecta"} · {when(m.em)}</div>
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.texto}</p>
          </div>
        ))}
        {!closed && (
          <div className="space-y-2">
            <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Sua mensagem" placeholder={author ? "Escreva para a equipe" : "Conte a sua versão"} />
            <div className="flex justify-end"><Button onClick={() => void send()} disabled={busy || text.trim().length < 2}>Enviar</Button></div>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Fotos e documentos</h2>
        <p className="text-xs text-muted-foreground">Só a equipe vê, e só o que você escolher enviar. Nada é anexado sem a sua escolha.</p>
        {c.provas.map((p) => (
          <div key={p.id} className="text-sm">
            <ChatAttachment bucket="report-evidence" path={p.path} type={/\.pdf$/i.test(p.path) ? "application/pdf" : "image/jpeg"} name={p.nota ?? "Arquivo enviado"} />
            <div className="text-[11px] text-muted-foreground">{p.nota} · {when(p.em)}</div>
          </div>
        ))}
        {!closed && (
          <div className="space-y-2">
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-xs" aria-label="Escolher arquivo" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <input className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" maxLength={200} placeholder="O que é este arquivo? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Descrição do arquivo" />
            <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{EVIDENCE_CONSENT_TEXT}</span></label>
            <Button variant="outline" onClick={() => void upload()} disabled={busy || !file}>Enviar arquivo</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
