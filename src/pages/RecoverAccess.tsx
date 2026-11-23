import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button, Card, Input, Label, Progress } from "@/components/base";
import { supabase } from "@/lib/supabase";

const NL = "nao_lembro";
const SELECT = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Form = {
  type: "" | "cliente" | "casa"; name: string; oldEmail: string; city: string; contact: string;
  signup: string; lastAccess: string; plan: string; hadTx: string; lastTxMonth: string; lastTxValue: string; lastTxKind: string;
  usesAssistant: string; assistantName: string; hasMembers: string; membersCount: string; hasStaff: string; topHouses: string; word: string; website: string;
};
const EMPTY: Form = { type: "", name: "", oldEmail: "", city: "", contact: "", signup: "", lastAccess: "", plan: "", hadTx: "", lastTxMonth: "", lastTxValue: "", lastTxKind: "", usesAssistant: "", assistantName: "", hasMembers: "", membersCount: "", hasStaff: "", topHouses: "", word: "", website: "" };

function YesNo({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Prefiro não responder</option><option value="sim">Sim</option><option value="nao">Não</option><option value={NL}>Não lembro</option>
      </select>
    </div>
  );
}

/** "Perdi o acesso à minha conta": formulário guiado em 3 telas. A resposta é sempre a mesma; a decisão vem por e-mail. */
export function RecoverAccess() {
  const [step, setStep] = useState(1);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const parent = useMemo(() => { const m = /^#r=([0-9a-f-]{36})$/i.exec(window.location.hash); return m ? m[1].toLowerCase() : null; }, []);
  const set = (k: keyof Form) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const inp = (k: keyof Form) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value) });
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const next1 = () => {
    if (!f.type) return void toast.error("Diga se é uma conta de cliente ou de casa.");
    if (f.name.trim().length < 2) return void toast.error("Informe o nome da conta (ou o mais próximo que lembrar).");
    if (!EMAIL_RE.test(f.contact.trim())) return void toast.error("Informe o e-mail onde quer receber a resposta.");
    setStep(2);
  };

  const send = async () => {
    if (busy || !supabase) return;
    setBusy(true);
    const lc = (v: string) => (v === NL || v === "" ? v : v);
    const { error } = await supabase.functions.invoke("account-recovery", { body: {
      action: "submit", round: parent ? 2 : 1, parent_id: parent, website: f.website, contact_email: f.contact.trim(), security_word: f.word,
      claimed: { type: f.type, name: f.name, old_email: f.oldEmail, city: f.city },
      answers: { signup_month: f.signup, last_access_month: f.lastAccess, plan: f.plan === NL ? "" : f.plan, had_tx: lc(f.hadTx), last_tx_month: f.lastTxMonth, last_tx_value: f.lastTxValue,
        last_tx_kind: f.lastTxKind, uses_assistant: lc(f.usesAssistant), assistant_name: f.assistantName, has_members: lc(f.hasMembers), members_count: f.membersCount,
        has_staff: lc(f.hasStaff), top_houses: f.topHouses.split(/[;\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 3) },
    } });
    setBusy(false);
    if (error) return void toast.error("Não foi possível enviar agora. Confira os campos e tente de novo.");
    setDone("Recebemos o seu pedido. Se as informações fizerem sentido, a decisão chega por e-mail em até 24 horas.");
  };

  const casa = f.type === "casa";
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-lg p-6 space-y-4">
        <h1 className="font-display font-bold text-2xl">Perdi o acesso à minha conta</h1>
        {done ? (
          <>
            <p role="status" className="text-sm">{done}</p>
            <p className="text-xs text-muted-foreground">Confira também a caixa de spam. Por segurança, a resposta é sempre enviada para o e-mail que você informou aqui.</p>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Etapa {step} de 3{parent ? " · segunda rodada" : ""}</div>
              <Progress value={(step / 3) * 100} />
            </div>
            {parent && <p className="text-xs text-muted-foreground">Precisamos de mais informações. Refaça o pedido com o mesmo e-mail de contato e responda o máximo que lembrar.</p>}
            <div aria-hidden className="absolute -left-[9999px]"><label>Site<input tabIndex={-1} autoComplete="off" {...inp("website")} /></label></div>

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Vamos descobrir de qual conta você está falando. Tudo bem não lembrar de algo: responda o que souber.</p>
                <div><Label htmlFor="ra-type">Sua conta é de…</Label>
                  <select id="ra-type" className={SELECT} value={f.type} onChange={(e) => set("type")(e.target.value)}>
                    <option value="">Escolha</option><option value="cliente">Cliente</option><option value="casa">Casa</option>
                  </select></div>
                <div><Label htmlFor="ra-name">{casa ? "Nome da casa ou do responsável" : "Seu nome na plataforma"}</Label><Input id="ra-name" maxLength={120} {...inp("name")} /></div>
                <div><Label htmlFor="ra-old">E-mail que você usava (ou o mais parecido que lembrar)</Label><Input id="ra-old" maxLength={254} placeholder="ex.: ma***@gmail.com" {...inp("oldEmail")} />
                  <button type="button" className="mt-1 text-xs text-primary font-semibold hover:underline" onClick={() => set("oldEmail")(NL)}>Não lembro</button></div>
                <div><Label htmlFor="ra-city">Cidade</Label><Input id="ra-city" maxLength={80} {...inp("city")} /></div>
                <div><Label htmlFor="ra-contact">E-mail NOVO, onde você quer receber a resposta</Label><Input id="ra-contact" type="email" autoComplete="email" maxLength={254} {...inp("contact")} />
                  <p className="mt-1 text-xs text-muted-foreground">Use um e-mail que você acessa agora. Este será o novo e-mail da conta, se o pedido for aprovado.</p></div>
                <Button className="w-full" onClick={next1}>Continuar</Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Sobre a conta. Responda o que lembrar; “não lembro” não prejudica o seu pedido.</p>
                <div className="grid grid-cols-2 items-end gap-3">
                  <div><Label htmlFor="ra-signup">Mês do cadastro</Label><Input id="ra-signup" type="month" {...inp("signup")} /></div>
                  <div><Label htmlFor="ra-last">Último acesso</Label><Input id="ra-last" type="month" {...inp("lastAccess")} /></div>
                </div>
                {casa && (
                  <div><Label htmlFor="ra-plan">Plano da casa</Label>
                    <select id="ra-plan" className={SELECT} value={f.plan} onChange={(e) => set("plan")(e.target.value)}>
                      <option value="">Prefiro não responder</option><option value="gratis">Grátis</option><option value="essencial">Essencial</option><option value="profissional">Profissional</option><option value="maximo">Máximo</option><option value={NL}>Não lembro</option>
                    </select></div>
                )}
                <YesNo id="ra-tx" label="Já fez compras ou pagamentos pela plataforma?" value={f.hadTx} onChange={set("hadTx")} />
                {f.hadTx === "sim" && (
                  <div className="grid grid-cols-2 items-end gap-3">
                    <div><Label htmlFor="ra-txm">Mês da última</Label><Input id="ra-txm" type="month" {...inp("lastTxMonth")} /></div>
                    <div><Label htmlFor="ra-txv">Valor (R$)</Label><Input id="ra-txv" inputMode="decimal" maxLength={20} {...inp("lastTxValue")} /></div>
                  </div>
                )}
                {casa ? (
                  <>
                    <YesNo id="ra-mem" label="Tem membros cadastrados na casa?" value={f.hasMembers} onChange={set("hasMembers")} />
                    {f.hasMembers === "sim" && <div><Label htmlFor="ra-memn">Quantos, mais ou menos?</Label><Input id="ra-memn" inputMode="numeric" maxLength={8} {...inp("membersCount")} /></div>}
                    <YesNo id="ra-ast" label="Usa a assistente?" value={f.usesAssistant} onChange={set("usesAssistant")} />
                    {f.usesAssistant === "sim" && <div><Label htmlFor="ra-astn">Nome da assistente</Label><Input id="ra-astn" maxLength={60} {...inp("assistantName")} /></div>}
                    <YesNo id="ra-staff" label="Tem equipe cadastrada?" value={f.hasStaff} onChange={set("hasStaff")} />
                  </>
                ) : (
                  <div><Label htmlFor="ra-top">Casas com quem mais conversou (até 3, separadas por vírgula)</Label><Input id="ra-top" maxLength={240} {...inp("topHouses")} /></div>
                )}
                <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)}>Voltar</Button><Button className="flex-1" onClick={() => setStep(3)}>Continuar</Button></div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div><Label htmlFor="ra-word">Palavra de segurança (se você cadastrou uma)</Label><Input id="ra-word" maxLength={80} autoComplete="off" {...inp("word")} />
                  <p className="mt-1 text-xs text-muted-foreground">Deixe em branco se não lembrar. Nunca perguntamos a sua senha, e a nossa equipe nunca precisa dela.</p></div>
                <p className="text-xs text-muted-foreground">Ao enviar, você confirma que a conta é sua. A decisão chega por e-mail em até 24 horas, e sempre com um prazo de segurança antes de qualquer troca.</p>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(2)}>Voltar</Button><Button className="flex-1" disabled={busy || !supabase} onClick={send}>{busy ? "Enviando…" : "Enviar pedido"}</Button></div>
              </div>
            )}
          </>
        )}
        <Link to="/login" className="text-sm text-primary font-semibold hover:underline">Voltar para entrar</Link>
      </Card>
    </main>
  );
}

/** Destino do link enviado ao e-mail NOVO. O código fica no fragmento (#t=…), que não vai para servidores nem para logs. */
export function ConfirmRecovery() {
  const [state, setState] = useState<"conferindo" | "ok" | "erro">("conferindo");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const m = /^#t=([0-9a-f]{64})$/i.exec(window.location.hash);
    history.replaceState(null, "", window.location.pathname);
    if (!m || !supabase) return void setState("erro");
    void supabase.functions.invoke("account-recovery", { body: { action: "confirm", token: m[1] } }).then(({ data, error }) => {
      if (error || !data?.ok) return setState("erro");
      setEmail(String(data.email ?? "")); setState("ok");
    });
  }, []);
  const reset = async () => {
    if (!supabase || !email) return;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` });
    setSent(true);
  };
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="font-display font-bold text-2xl">Confirmar novo e-mail</h1>
        {state === "conferindo" && <p className="text-sm text-muted-foreground">Conferindo o link…</p>}
        {state === "erro" && <p role="alert" className="text-sm text-destructive">Este link não é válido, já foi usado ou venceu. Se ainda precisa recuperar a conta, faça um novo pedido.</p>}
        {state === "ok" && (
          <>
            <p role="status" className="text-sm">Pronto: o e-mail da conta foi atualizado. Agora crie a sua nova senha. Enviaremos o link para este mesmo e-mail.</p>
            {sent ? <p role="status" className="text-sm">Link enviado. Confira também a caixa de spam.</p> : <Button className="w-full" onClick={reset}>Criar nova senha</Button>}
          </>
        )}
        <Link to="/login" className="text-sm text-primary font-semibold hover:underline">Ir para entrar</Link>
      </Card>
    </main>
  );
}
