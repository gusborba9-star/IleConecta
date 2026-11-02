import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2, UsersRound } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import PremiumShowcase from "@/components/premium/PremiumShowcase";
import { useApp } from "@/contexts/AppContext";
import { houseIdOf } from "@/lib/campaigns";
import { useOwnerPlan } from "@/lib/housePlan";
import { cancelStaffInvite, createStaffInvite, fetchTeam, removeStaff, staffInviteUrl, updateStaff, type StaffInvite, type StaffMember } from "@/lib/staff";

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><strong>{label}</strong><span className="block text-xs text-muted-foreground">{hint}</span></span>
    </label>
  );
}

/** Equipe da casa: o acesso "pai" convida mais uma pessoa e define o que ela vê e faz. */
export default function Equipe() {
  const { currentUser, isRemoteAuth } = useApp();
  const confirm = useConfirm();
  const uid = currentUser?.id;
  const { premium, loading } = useOwnerPlan(uid);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [name, setName] = useState("");
  const [canReply, setCanReply] = useState(true);
  const [canOrders, setCanOrders] = useState(false);

  const reload = useCallback(async (id: string) => {
    const t = await fetchTeam(id);
    setMembers(t.members);
    setInvites(t.invites);
  }, []);
  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    void houseIdOf(uid).then((id) => {
      setHouseId(id);
      if (id) void reload(id);
    });
  }, [isRemoteAuth, uid, reload]);

  if (!currentUser || currentUser.type !== "commercial" || !isRemoteAuth) {
    return <Card className="p-6"><h1 className="font-display font-bold text-2xl">Equipe da casa</h1><p className="text-sm text-muted-foreground mt-1">Esta área é da conta de uma casa.</p></Card>;
  }
  if (loading) return <div className="h-40" aria-busy />;
  if (!premium) return <div className="space-y-4 pb-16 lg:pb-4"><PremiumShowcase kind="team" /></div>;

  const used = members.length + invites.length;
  const invite = async () => {
    if (!houseId || name.trim().length < 2) return void toast.error("Escreva o nome de quem vai atender.");
    const err = await createStaffInvite(houseId, name, canReply, canOrders);
    if (err) return void toast.error(err);
    setName("");
    toast.success("Convite criado. Envie o link para a pessoa.");
    await reload(houseId);
  };
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(staffInviteUrl(token));
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie.");
    }
  };
  const change = async (m: StaffMember, patch: { canReply?: boolean; canOrders?: boolean }) => {
    if (!(await updateStaff(m.id, patch))) toast.error("Não foi possível salvar.");
    if (houseId) await reload(houseId);
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Premium</div>
        <h1 className="font-display font-bold text-2xl flex items-center gap-2 mt-1"><UsersRound className="h-6 w-6 text-primary" /> Equipe da casa</h1>
        <p className="text-sm text-muted-foreground mt-1">Seu acesso é o principal. Convide mais uma pessoa de confiança para atender os clientes, e você decide o que ela vê e faz. Nas conversas, o cliente vê “Atendido por” e o nome dela.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display font-bold text-lg">Acessos</h2>
          <Badge tone="gold">{1 + used} de 2</Badge>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center justify-between gap-2">
          <div><div className="font-semibold">{currentUser.name}</div><div className="text-xs text-muted-foreground">Acesso principal: vê e faz tudo</div></div>
          <Badge tone="forest">Principal</Badge>
        </div>

        {members.map((m) => (
          <div key={m.id} className="rounded-2xl border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div><div className="font-semibold">{m.name}</div><div className="text-xs text-muted-foreground">Atende pela casa</div></div>
              <Button size="sm" variant="ghost" aria-label={`Tirar ${m.name} da equipe`} onClick={async () => {
                if (!(await confirm({ title: "Tirar da equipe?", message: `${m.name} deixa de atender pela casa agora.`, confirmLabel: "Tirar", danger: true }))) return;
                if (!(await removeStaff(m.id))) toast.error("Não foi possível remover.");
                if (houseId) await reload(houseId);
              }}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Toggle checked={m.canReply} onChange={(v) => void change(m, { canReply: v })} label="Responder conversas" hint="Lê e responde os clientes pela casa. Desligado, só lê." />
            <Toggle checked={m.canOrders} onChange={(v) => void change(m, { canOrders: v })} label="Ver pedidos" hint="Vê a lista de pedidos de serviço, sem alterar nada." />
          </div>
        ))}

        {invites.map((i) => (
          <div key={i.token} className="rounded-2xl border border-dashed border-gold/60 bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2"><div><div className="font-semibold">{i.name}</div><div className="text-xs text-muted-foreground">Convite pendente, vale por 7 dias</div></div><Badge tone="gold">Aguardando</Badge></div>
            <div className="text-xs text-muted-foreground break-all select-all">{staffInviteUrl(i.token)}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy(i.token)}><Copy className="h-4 w-4" /> Copiar link</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (await cancelStaffInvite(i.token) && houseId) await reload(houseId); }}>Cancelar convite</Button>
            </div>
          </div>
        ))}

        {used >= 1 ? (
          <p className="text-sm text-muted-foreground">Os 2 acessos do Premium estão em uso.</p>
        ) : (
          <div className="space-y-3">
            <div><Label htmlFor="eq-name">Nome de quem vai atender</Label><Input id="eq-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="é o nome que o cliente vê" /></div>
            <Toggle checked={canReply} onChange={setCanReply} label="Responder conversas" hint="Lê e responde os clientes pela casa." />
            <Toggle checked={canOrders} onChange={setCanOrders} label="Ver pedidos" hint="Vê a lista de pedidos de serviço, sem alterar nada." />
            <Button onClick={() => void invite()}><Plus className="h-4 w-4" /> Criar convite</Button>
            <p className="text-xs text-muted-foreground">A pessoa entra com uma conta de cliente dela, abre o link e aceita. Você pode mudar as permissões ou tirá-la quando quiser.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
