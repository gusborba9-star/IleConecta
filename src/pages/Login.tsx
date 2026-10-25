import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, Label } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { Flame } from "lucide-react";
import { toast } from "sonner";
const hero = "https://images.unsplash.com/photo-1503756234508-e32369269deb?w=1600&h=1200&fit=crop";

export default function Login() {
  const { login, currentUser, isRemoteAuth, authReady } = useApp();
  const [email, setEmail] = useState(isRemoteAuth ? "" : "mari@cliente.app");
  const [password, setPassword] = useState(isRemoteAuth ? "" : "123456");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (currentUser) nav("/", { replace: true });
  }, [currentUser, nav]);

  if (currentUser || !authReady) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        toast.success(`Axé${result.user ? `, ${result.user.name}` : ""}!`);
        nav("/");
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
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
            <div className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground grid place-items-center">
              <Flame className="h-6 w-6" />
            </div>
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
  );
}
