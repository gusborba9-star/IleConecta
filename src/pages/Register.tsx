import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Input, Label } from "@/components/base";
import { forgetReferral, lookupReferral, rememberReferral } from "@/lib/referral";
import { useApp } from "@/contexts/AppContext";
import { Gift, User, Store } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { toast } from "sonner";
import Footer from "@/components/layout/Footer";
import { savePendingConsent } from "@/lib/pendingConsent";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/types";
import type { LucideIcon } from "lucide-react";

export default function Register() {
  const { register, isRemoteAuth } = useApp();
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const nav = useNavigate();
  const [search] = useSearchParams();
  const [type, setType] = useState<AccountType>(search.get("tipo") === "casa" ? "commercial" : "personal");
  // Convite de outra casa: o código vem no link (?ref=) e só conta para contas de casa.
  const [refCode] = useState(() => (isRemoteAuth ? rememberReferral(search.get("ref")) : ""));
  const [inviter, setInviter] = useState<string | null>(null);
  useEffect(() => {
    if (!refCode) return;
    let alive = true;
    void lookupReferral(refCode).then((n) => alive && setInviter(n));
    return () => {
      alive = false;
    };
  }, [refCode]);
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
    if (isRemoteAuth && !agree) return toast.error("Para criar a conta, marque que leu e aceita os termos.");
    setLoading(true);
    try {
      if (isRemoteAuth) savePendingConsent(email, type === "commercial" ? "termos_casa" : "termos_cliente");
      const result = await register({ ...form, name, email, city: form.city.trim(), state: form.state.trim(), type, referralCode: type === "commercial" && inviter ? refCode : undefined });
      if (!result.ok) return toast.error(result.error);
      if (type === "commercial") forgetReferral();
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
          <LogoMark size={48} />
          <div>
            <div className="font-display font-bold text-xl">Criar conta</div>
            <div className="text-xs text-muted-foreground">Escolha o tipo de conta</div>
            {!isRemoteAuth && (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Protótipo local: use dados fictícios. Não informe senhas reais; a conta não é criada em um servidor.</p>
            )}
          </div>
        </div>

        {inviter && type === "commercial" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
            <Gift className="h-4 w-4 text-gold shrink-0" /> Você foi convidado(a) pela casa <strong>{inviter}</strong>.
          </div>
        )}
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
          {isRemoteAuth && (
            <label className="md:col-span-2 flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                Li e aceito os{" "}
                <Link to={`/sobre/${type === "commercial" ? "termos-da-casa" : "termos-do-cliente"}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {type === "commercial" ? "Termos de Uso da Casa Espiritual" : "Termos de Uso"}
                </Link>{" "}
                e a{" "}
                <Link to="/sobre/privacidade-lgpd" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política de Privacidade</Link>.
              </span>
            </label>
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
