import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, Label } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { Flame, User, Store } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/types";

export default function Register() {
  const { register } = useApp();
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return toast.error("Preencha todos os campos");
    register({ ...form, type });
    toast.success("Bem-vindo(a) ao Ilê Conecta!");
    nav("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground grid place-items-center">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display font-bold text-xl">Criar conta</div>
            <div className="text-xs text-muted-foreground">Escolha o tipo de conta</div>
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
            desc="Publique trabalhos, rituais e receba clientes com pagamento integrado."
          />
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>{type === "commercial" ? "Nome da casa" : "Seu nome"}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label>Estado</Label>
            <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          {type === "commercial" && (
            <div className="md:col-span-2">
              <Label>Categoria / tradição</Label>
              <Input placeholder="Ex: Candomblé Ketu, Umbanda..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          )}
          <div className="md:col-span-2 flex justify-between items-center pt-2">
            <Link to="/login" className="text-sm text-muted-foreground hover:underline">Já tenho conta</Link>
            <Button type="submit" size="lg">Criar conta</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function TypeCard({ active, onClick, icon: Icon, title, desc }: any) {
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
