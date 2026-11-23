import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import { supabase } from "@/lib/supabase";

type Ev = { id: string; kind: string; detail: Record<string, unknown>; created_at: string; reported: boolean };
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const WHAT = (e: Ev): string => {
  switch (e.kind) {
    case "login_novo_aparelho": return `Entrada em um aparelho novo: ${String(e.detail.label ?? "aparelho")}`;
    case "conta_bloqueada": return "Conta bloqueada por excesso de tentativas de senha";
    case "senha_alterada": return "Senha alterada";
    case "palavra_alterada": return "Palavra de segurança alterada";
    case "recuperacao_pedida": return "Pedido de recuperação de acesso da sua conta";
    case "recuperacao_aprovada": return "Troca do e-mail da conta aprovada, aguardando confirmação";
    case "email_alterado": return "E-mail da conta alterado";
    default: return "Aviso de segurança";
  }
};

/** Atividade de segurança da própria conta. "Se foi você, não precisa fazer nada"; se não foi, um toque abre o pedido para a administração. */
export default function SecurityActivity() {
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [busy, setBusy] = useState("");
  const load = () => { if (!supabase) return; void supabase.rpc("my_security_events").then(({ data }) => setRows((data as Ev[] | null) ?? [])); };
  useEffect(load, []);
  const report = async (id: string) => {
    if (!supabase || busy) return;
    setBusy(id);
    const { error } = await supabase.rpc("my_security_report", { p_event: id });
    setBusy("");
    if (error) return void toast.error("Não foi possível enviar agora. Tente de novo.");
    toast.success("Pedido enviado à administração.");
    load();
  };
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="font-display font-bold text-2xl">Segurança da conta</h1>
        <p className="text-sm text-muted-foreground">Os avisos recentes sobre a sua conta. Se foi você, não precisa fazer nada. Se não foi, toque em "Não fui eu".</p>
      </div>
      <Card className="p-4 text-sm space-y-2">
        <p className="font-semibold">Quer proteger ainda mais?</p>
        <p className="text-muted-foreground">Troque a senha se desconfiar de alguém. A palavra de segurança ajuda a provar que a conta é sua se um dia você perder o acesso.</p>
        <div className="flex flex-wrap gap-3"><Link to="/recuperar-senha" className="text-primary font-semibold hover:underline">Trocar minha senha</Link><Link to="/suporte" className="text-primary font-semibold hover:underline">Falar com o suporte</Link></div>
      </Card>
      {rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aviso até agora.</p>}
      <ul className="space-y-2">
        {rows?.map((e) => (
          <li key={e.id}><Card className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-sm font-medium">{WHAT(e)}</p><p className="text-xs text-muted-foreground">{fmt(e.created_at)}</p></div>
            {e.reported ? <Badge>Enviado à administração</Badge> : <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => report(e.id)}>Não fui eu</Button>}
          </Card></li>
        ))}
      </ul>
    </div>
  );
}

/** Página aberta pelo link do e-mail ("Fui eu, desbloquear" / "Não fui eu"). A ação só acontece no botão, nunca ao abrir. */
export function SecurityConfirm() {
  const [act, setAct] = useState<"unlock" | "report" | null>(null);
  const [token, setToken] = useState("");
  const [state, setState] = useState<"pronto" | "enviando" | "ok" | "erro">("pronto");
  useEffect(() => {
    const m = /^#a=(unlock|report)&t=([0-9a-f]{64})$/i.exec(window.location.hash);
    history.replaceState(null, "", window.location.pathname);
    if (m) { setAct(m[1].toLowerCase() as "unlock" | "report"); setToken(m[2].toLowerCase()); } else setState("erro");
  }, []);
  const go = async () => {
    if (!supabase || !act) return;
    setState("enviando");
    const { data, error } = await supabase.functions.invoke("account-recovery", { body: { action: act === "unlock" ? "sec_unlock" : "sec_report", token } });
    setState(error || !data?.ok ? "erro" : "ok");
  };
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="font-display font-bold text-2xl">{act === "unlock" ? "Desbloquear minha conta" : "Não fui eu"}</h1>
        {state === "erro" && <p role="alert" className="text-sm text-destructive">Este link não é válido, já foi usado ou venceu. Se precisa de ajuda, use "Perdi o acesso à minha conta" na tela de entrada.</p>}
        {state === "ok" && <p role="status" className="text-sm">{act === "unlock" ? "Pronto: a sua conta foi desbloqueada. Você já pode entrar." : "Recebemos o seu aviso. A administração vai analisar. Se quiser, troque a sua senha agora."}</p>}
        {(state === "pronto" || state === "enviando") && act && (
          <>
            <p className="text-sm text-muted-foreground">{act === "unlock" ? "Confirme que foi você quem errou a senha. A conta será desbloqueada na hora." : "Confirme que não foi você. A administração será avisada e vai analisar o caso."}</p>
            <Button className="w-full" disabled={state === "enviando"} onClick={go}>{act === "unlock" ? "Fui eu, desbloquear" : "Não fui eu, avisar a administração"}</Button>
          </>
        )}
        <div className="flex gap-4 text-sm"><Link to="/login" className="text-primary font-semibold hover:underline">Entrar</Link><Link to="/recuperar-senha" className="text-primary font-semibold hover:underline">Trocar minha senha</Link></div>
      </Card>
    </main>
  );
}
