import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import ReportOccurrence from "@/components/support/ReportOccurrence";
import { askConecta, type ConectaAction, type ConectaTurn } from "@/lib/conecta";
import { supabase } from "@/lib/supabase";
import { MAX_INPUT_CHARS } from "@/lib/conectaCore.js";
import { SCREENS } from "@/content/screens";

interface Bubble extends ConectaTurn { actions?: ConectaAction[] }
const HELLO: Bubble = { role: "assistant", content: "Oi! Eu sou a Conecta, a assistente de apoio do Ilê Conecta. Pergunte sobre a plataforma, a sua conta, pagamentos ou regras. Se for algo que só a equipe resolve, eu preparo o chamado para você revisar e enviar." };

/** Chat de apoio da plataforma. A assistente só orienta e sugere; abrir chamado é sempre confirmado pela pessoa (exceto aviso de risco de vida). */
export default function ConectaChat() {
  const [turns, setTurns] = useState<Bubble[]>([HELLO]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ kind: string; title: string; description: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [turns, busy]);

  const send = async () => {
    const msg = text.trim();
    if (msg.length < 2 || busy) return;
    const history = turns.filter((t) => t !== HELLO).map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: msg }]);
    setText(""); setBusy(true);
    const r = await askConecta(msg, history);
    setBusy(false);
    if (!r.ok) return void setTurns((t) => [...t, { role: "assistant", content: r.error }]);
    setTurns((t) => [...t, { role: "assistant", content: r.data.reply, actions: r.data.actions }]);
  };

  const resetPassword = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) return void toast.error("Não encontrei o e-mail da conta.");
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` });
    toast.success("Se o e-mail estiver correto, o link chegou na sua caixa (confira o spam).");
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /><h2 className="font-display font-bold text-lg">Fale com a Conecta</h2></div>
      <div className="max-h-96 overflow-y-auto space-y-2 pr-1" role="log" aria-live="polite" aria-label="Conversa com a Conecta">
        {turns.map((t, i) => (
          <div key={i} className={`rounded-lg p-3 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${t.role === "user" ? "bg-primary/10 ml-8" : "bg-muted/50 mr-8"}`}>
            {t.content}
            {t.actions?.map((a, j) => a.type === "propose_case" ? (
              <div key={j} className="mt-2"><Button size="sm" onClick={() => setDraft(a)}>Abrir chamado (você revisa antes de enviar)</Button></div>
            ) : a.type === "go_to" ? (
              <div key={j} className="mt-2"><Link to={a.path} className="text-primary font-semibold hover:underline">Ir para {SCREENS.find((s) => s.path === a.path)?.name ?? "a tela"} →</Link></div>
            ) : (
              <div key={j} className="mt-2"><Link to="/suporte/chamados" className="text-primary font-semibold hover:underline">Ver em Meus chamados →</Link></div>
            ))}
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground" aria-label="A Conecta está escrevendo">Escrevendo…</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input aria-label="Pergunte à Conecta" className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm" maxLength={MAX_INPUT_CHARS} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva sua pergunta" />
        <Button type="submit" disabled={busy || text.trim().length < 2} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </form>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <button className="text-primary font-semibold hover:underline" onClick={() => void resetPassword()}>Receber link de nova senha no meu e-mail</button>
        <span>A Conecta pode errar. Não envie senhas nem dados de cartão. Situações de risco à vida são avisadas à equipe na hora.</span>
      </div>
      <ReportOccurrence open={Boolean(draft)} onClose={() => setDraft(null)} source="assistente" defaultKind={draft?.kind} defaultTitle={draft?.title} defaultDescription={draft?.description} />
    </Card>
  );
}
