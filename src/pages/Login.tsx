import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Input, Label } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { GoldMark, LogoMark } from "@/components/brand/Logo";
import { toast } from "sonner";
import Footer from "@/components/layout/Footer";
import { dayPeriodGreeting, welcomeName } from "@/lib/greeting";

export default function Login() {
  const { login, currentUser, isRemoteAuth, authReady } = useApp();
  const [email, setEmail] = useState(isRemoteAuth ? "" : "mari@cliente.app");
  const [password, setPassword] = useState(isRemoteAuth ? "" : "123456");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const raw = (location.state as { from?: string } | null)?.from;
  // Só volta para caminhos do próprio app.
  const back = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  useEffect(() => {
    if (currentUser) nav(back, { replace: true });
  }, [currentUser, nav, back]);

  if (currentUser || !authReady) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        toast.success(result.user ? `Boas-vindas, ${welcomeName(result.user.name, result.user.type !== "personal")}!` : "Boas-vindas!", { description: `${dayPeriodGreeting()}. Axé!` });
        nav(back);
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 grid lg:grid-cols-2">
      <div className="relative hidden lg:block overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 20% 10%, #1B6A50 0%, #0E3B2C 48%, #07231A 100%)" }} />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #F4DC92 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <GoldMark size={620} className="absolute -right-32 -top-24 opacity-[0.14] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <div className="max-w-md space-y-3">
            <div className="text-xs tracking-[0.3em] uppercase text-gold">Ilê Conecta</div>
            <h1 className="font-display font-bold text-4xl leading-tight">A rede das casas de religião afro.</h1>
            <p className="text-white/80">
              Descubra terreiros, contrate rituais, converse pelo chat e conecte-se com sua espiritualidade em um só lugar.
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <Card className="w-full max-w-md p-8">
          <div className="flex items-center gap-3 mb-6">
            <LogoMark size={48} />
            <div>
              <div className="font-display font-bold text-xl">Ilê Conecta</div>
              <div className="text-xs text-muted-foreground">Entre com sua conta</div>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="login-email">E-mail</Label>
              <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="login-password">Senha</Label>
              <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button className="w-full" size="lg" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button>
          </form>

          <div className="altar-divider my-6 rounded" />

          <div className="text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link to="/register" className="text-primary font-semibold hover:underline">Criar agora</Link>
          </div>

          {!isRemoteAuth && (
            <>
          <div className="mt-5 p-3 rounded-xl border border-amber-300/60 bg-amber-50 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 space-y-1">
            <div className="font-semibold">Ambiente de demonstração</div>
            <div>Use apenas dados fictícios. As contas e senhas são locais neste navegador; não informe credenciais reais.</div>
          </div>
          <div className="mt-3 p-3 rounded-xl bg-muted text-xs text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Contas de demonstração</div>
            <div>Cliente · mari@cliente.app · 123456</div>
            <div>Casa · oxum@ile.app · 123456</div>
          </div>
            </>
          )}
        </Card>
      </div>
    </div>
    <Footer />
    </div>
  );
}
