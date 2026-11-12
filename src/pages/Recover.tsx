import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button, Card, Input, Label } from "@/components/base";
import PasswordInput from "@/components/base/PasswordInput";
import { MIN_PASSWORD_LENGTH, translateAuthError } from "@/lib/remoteAuth";
import { supabase } from "@/lib/supabase";

const COOLDOWN_MS = 60_000;

/** "Esqueci a senha": pede o e-mail. A resposta é sempre a mesma, exista a conta ou não (não revela quem tem cadastro). */
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase) return;
    if (Date.now() - last < COOLDOWN_MS) return void toast.error("Aguarde um minuto antes de pedir de novo.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return void toast.error("Informe um e-mail válido.");
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
    setBusy(false);
    setLast(Date.now());
    setSent(true);
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="font-display font-bold text-2xl">Recuperar acesso</h1>
        {sent ? (
          <p role="status" className="text-sm">Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam. O link vale por pouco tempo.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.</p>
            <div><Label htmlFor="fp-email">E-mail</Label><Input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={busy || !supabase}>{busy ? "Enviando…" : "Enviar link"}</Button>
          </form>
        )}
        <Link to="/login" className="text-sm text-primary font-semibold hover:underline">Voltar para entrar</Link>
        <p className="text-xs text-muted-foreground">Sem acesso ao e-mail? Abra um chamado depois de entrar ou escreva para o suporte (página Suporte).</p>
      </Card>
    </div>
  );
}

/** Destino do link do e-mail: a sessão de recuperação já chega pronta; aqui a pessoa define a nova senha. */
export function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return void setReady(false);
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === "PASSWORD_RECOVERY" || s) setReady(true); });
    void supabase.auth.getSession().then(({ data }) => setReady((v) => v || Boolean(data.session)));
    const t = setTimeout(() => setReady((v) => (v === null ? false : v)), 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !supabase) return;
    if (pw.length < MIN_PASSWORD_LENGTH) return void toast.error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (pw !== pw2) return void toast.error("As senhas não são iguais.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(translateAuthError(error.message));
    toast.success("Senha alterada.");
    nav("/", { replace: true });
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="font-display font-bold text-2xl">Nova senha</h1>
        {ready === null && <p className="text-sm text-muted-foreground">Conferindo o link…</p>}
        {ready === false && (
          <>
            <p role="alert" className="text-sm text-destructive">Este link não é mais válido. Peça um novo.</p>
            <Link to="/recuperar-senha" className="text-sm text-primary font-semibold hover:underline">Pedir novo link</Link>
          </>
        )}
        {ready && (
          <form onSubmit={submit} className="space-y-3">
            <div><Label htmlFor="rp-pw">Nova senha</Label><PasswordInput id="rp-pw" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
            <div><Label htmlFor="rp-pw2">Repita a senha</Label><PasswordInput id="rp-pw2" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
