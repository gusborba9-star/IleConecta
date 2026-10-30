import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, Label } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { Flame, User, Store } from "lucide-react";
import { toast } from "sonner";
import Footer from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/types";
import type { LucideIcon } from "lucide-react";

export default function Register() {
  const { register, isRemoteAuth } = useApp();
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const nav = useNavigate();
  const [type, setType] = useState<AccountType>("personal");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    city: "",
    state: "",
    country: "Brasil",
    category: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name || !email || !form.password.trim()) return toast.error("Preencha nome, e-mail e senha.");
    if (isRemoteAuth && form.password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    try {
      const result = await register({ ...form, name, email, city: form.city.trim(), state: form.state.trim(), type });
      if (!result.ok) return toast.error(result.error);
      if (result.needsEmailConfirmation) return setPendingEmail(email);
      toast.success(isRemoteAuth ? "Conta criada. Axé!" : "Conta de demonstração criada neste navegador.");
      nav("/");
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-3">
          <div className="font-display font-bold text-xl">Confirme seu e-mail</div>
          <p className="text-sm text-muted-foreground">
            Enviamos um link para <strong>{pendingEmail}</strong>. Abra o e-mail, confirme e volte para entrar.
          </p>
          <Link to="/login" className="text-primary font-semibold hover:underline text-sm">Ir para o login</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground grid place-items-center">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display font-bold text-xl">Criar conta</div>
            <div className="text-xs text-muted-foreground">Escolha o tipo de conta</div>
            {!isRemoteAuth && (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Protótipo local: use dados fictícios. Não informe senhas reais; a conta não é criada em um servidor.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <TypeCard
            active={type === "personal"}
            onClick={() => setType("personal")}
            icon={User}
            title="Cliente"
            desc="Encontre casas, contrate rituais e converse com sacerdotes."
          />
          <TypeCard
            active={type === "commercial"}
            onClick={() => setType("commercial")}
            icon={Store}
            title="Casa espiritual"
            desc="Publique trabalhos, rituais e organize sua presença na demonstração."
          />
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="register-name">{type === "commercial" ? "Nome da casa" : "Seu nome"}</Label>
            <Input id="register-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="register-email">E-mail</Label>
            <Input id="register-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="register-password">Senha</Label>
            <Input id="register-password" type="password" minLength={isRemoteAuth ? 8 : undefined} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="register-city">Cidade</Label>
            <Input id="register-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="register-state">Estado</Label>
            <Input id="register-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          {type === "commercial" && (
            <div className="md:col-span-2">
              <Label htmlFor="register-category">Categoria / tradição</Label>
              <Input id="register-category" placeholder="Ex: Candomblé Ketu, Umbanda..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          )}
          <div className="md:col-span-2 flex justify-between items-center pt-2">
            <Link to="/login" className="text-sm text-muted-foreground hover:underline">Já tenho conta</Link>
            <Button type="submit" size="lg" disabled={loading}>{loading ? "Criando…" : "Criar conta"}</Button>
          </div>
        </form>
      </Card>
    </div>
    <Footer />
    </div>
  );
}

function TypeCard({ active, onClick, icon: Icon, title, desc }: { active: boolean; onClick: () => void; icon: LucideIcon; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-4 rounded-2xl border-2 transition",
        active ? "border-primary bg-primary/5 shadow-card" : "border-border hover:border-primary/40"
      )}
    >
      <Icon className={cn("h-6 w-6 mb-2", active ? "text-primary" : "text-muted-foreground")} />
      <div className="font-display font-bold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}
