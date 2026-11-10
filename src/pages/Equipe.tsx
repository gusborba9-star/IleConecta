import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Copy, PauseCircle, PlayCircle, Plus, Trash2, UsersRound } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { houseIdOf } from "@/lib/campaigns";
import { actorLabel, describeStaffEvent, fetchStaffAudit, type StaffAuditEvent } from "@/lib/staffAudit";
import { useOwnerPlan } from "@/lib/housePlan";
import { formatMoney } from "@/lib/pricing";
import { qrSvg } from "@/lib/qr";
import {
  PERMS, cancelStaffInvite, createStaffInvite, fetchSeatAllowance, fetchTeam, removeStaff, staffInviteUrl, togglePerm, updateStaff,
  type PermKey, type StaffInvite, type StaffMember,
} from "@/lib/staff";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><strong>{label}</strong><span className="block text-xs text-muted-foreground">{hint}</span></span>
    </label>
  );
}

/** Todas as ferramentas que a casa pode liberar, uma a uma. */
function PermList({ perms, onChange, premium }: { perms: PermKey[]; onChange: (p: PermKey[]) => void; premium: boolean }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">O que esta pessoa pode fazer</legend>
      {PERMS.map((p) => {
        const locked = p.premiumOnly && !premium;
        return (
          <div key={p.key} className={locked ? "opacity-60" : ""}>
            <Toggle checked={!locked && perms.includes(p.key)} onChange={(v) => !locked && onChange(togglePerm(perms, p.key, v))} label={`${p.label}${locked ? " · Premium" : ""}`} hint={p.hint} />
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Pagamentos, plano, perfil da casa e a gestão da equipe ficam sempre só com você.</p>
    </fieldset>
  );
}

function InviteQr({ token }: { token: string }) {
  const svg = useMemo(() => qrSvg(staffInviteUrl(token), { scale: 8 }), [token]);
  return <div className="w-36 h-36 shrink-0 rounded-xl border border-border bg-white p-1 [&>svg]:w-full [&>svg]:h-full" role="img" aria-label="QR code do convite" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Equipe da casa: o acesso principal ("pai") convida, define o que cada pessoa vê e faz, pausa e remove. */
export default function Equipe() {
  const { currentUser, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const confirm = useConfirm();
  const uid = currentUser?.id;
  const { plan, loading } = useOwnerPlan(uid);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<number | null>(null);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [history, setHistory] = useState<StaffAuditEvent[]>([]);
  const [name, setName] = useState("");
  const [newPerms, setNewPerms] = useState<PermKey[]>(["chat_read", "chat_reply"]);

  const reload = useCallback(async (id: string) => {
    const [t, a, h] = await Promise.all([fetchTeam(id), fetchSeatAllowance(id), fetchStaffAudit(id)]);
    setHistory(h);
    setMembers(t.members);
    setInvites(t.invites);
    setAllowance(a);
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
  if (loading || allowance === null) return <div className="h-40" aria-busy />;

  const price = plan ? config.pricing.extra_seat[plan] : null;
  const used = members.length + invites.length;
  const free = Math.max(0, allowance - used);

  const invite = async () => {
    if (!houseId || name.trim().length < 2) return void toast.error("Escreva o nome de quem vai atender.");
    const err = await createStaffInvite(houseId, name, newPerms);
    if (err) return void toast.error(err);
    setName("");
    toast.success("Convite criado. Envie o link ou mostre o QR code.");
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
  const change = async (m: StaffMember, patch: { perms?: PermKey[]; active?: boolean }) => {
    if (!(await updateStaff(m.id, patch))) toast.error("Não foi possível salvar.");
    if (houseId) await reload(houseId);
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Equipe da casa</div>
        <h1 className="font-display font-bold text-2xl flex items-start gap-2 mt-1"><UsersRound className="h-6 w-6 mt-1 shrink-0 text-primary" /> <span>Mais alguém atendendo, com você no controle</span></h1>
        <p className="text-sm text-muted-foreground mt-1">Seu acesso é o principal. Cada pessoa convidada atende os clientes pela casa, vê só as ferramentas que você liberar e aparece no chat como “Atendido por” com o nome dela. Você pausa ou remove quando quiser.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display font-bold text-lg">Acessos</h2>
          <Badge tone="gold">{1 + used} de {1 + allowance}</Badge>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center justify-between gap-2">
          <div><div className="font-semibold">{currentUser.name}</div><div className="text-xs text-muted-foreground">Acesso principal: vê e faz tudo</div></div>
          <Badge tone="forest">Principal</Badge>
        </div>

        {members.map((m) => (
          <div key={m.id} className={`rounded-2xl border border-border bg-muted/30 p-3 space-y-3 ${m.active ? "" : "opacity-80"}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div><div className="font-semibold">{m.name} {!m.active && <Badge tone="muted" className="ml-1">Pausado</Badge>}</div><div className="text-xs text-muted-foreground">{m.active ? "Atende pela casa" : "Sem acesso agora"}</div></div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={async () => {
                  if (m.active && !(await confirm({ title: "Pausar o acesso?", message: `${m.name} perde o acesso agora. Você pode liberar de novo quando quiser.`, confirmLabel: "Pausar" }))) return;
                  await change(m, { active: !m.active });
                }}>{m.active ? <><PauseCircle className="h-4 w-4" /> Desconectar</> : <><PlayCircle className="h-4 w-4" /> Liberar</>}</Button>
                <Button size="sm" variant="ghost" aria-label={`Remover ${m.name} da equipe`} onClick={async () => {
                  if (!(await confirm({ title: "Remover da equipe?", message: `${m.name} deixa de atender pela casa, e o acesso volta a ficar livre.`, confirmLabel: "Remover", danger: true }))) return;
                  if (!(await removeStaff(m.id))) toast.error("Não foi possível remover.");
                  if (houseId) await reload(houseId);
                }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <PermList perms={m.perms} premium={plan === "maximo"} onChange={(p) => void change(m, { perms: p })} />
          </div>
        ))}

        {invites.map((i) => (
          <div key={i.token} className="rounded-2xl border border-dashed border-gold/60 bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2"><div><div className="font-semibold">{i.name}</div><div className="text-xs text-muted-foreground">Convite pendente, vale por 7 dias</div></div><Badge tone="gold">Aguardando</Badge></div>
            <div className="flex flex-wrap items-center gap-4">
              <InviteQr token={i.token} />
              <div className="min-w-[200px] flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">No outro aparelho, aponte a câmera para o QR code ou abra o link. A pessoa entra com a conta dela e aceita.</p>
                <div className="text-xs text-muted-foreground break-all select-all">{staffInviteUrl(i.token)}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void copy(i.token)}><Copy className="h-4 w-4" /> Copiar link</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (await cancelStaffInvite(i.token) && houseId) await reload(houseId); }}>Cancelar convite</Button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {free > 0 ? (
          <div className="space-y-3">
            <div><Label htmlFor="eq-name">Nome de quem vai atender</Label><Input id="eq-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="é o nome que o cliente vê" /></div>
            <PermList perms={newPerms} premium={plan === "maximo"} onChange={setNewPerms} />
            <Button onClick={() => void invite()}><Plus className="h-4 w-4" /> Criar convite</Button>
          </div>
        ) : (
          <div className="pillow rounded-2xl bg-muted/30 p-4 space-y-2">
            <div className="font-semibold">{allowance === 0 ? "Adicione um acesso para quem ajuda a atender" : "Todos os acessos estão em uso"}</div>
            <p className="text-sm text-muted-foreground">
              Acesso extra: <strong>{formatMoney(price ?? null)}/mês</strong> no plano atual. Se a casa mudar de plano, o valor acompanha o novo plano, e a pessoa continua com o acesso e as mesmas permissões.
            </p>
            <p className="text-xs text-muted-foreground">A contratação dentro do app chega com o pagamento recorrente. Por enquanto, peça pelo <Link to="/suporte" className="text-primary font-semibold">Suporte</Link> e liberamos o acesso para a sua casa.</p>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display font-bold text-lg">Histórico da equipe</h2>
        <p className="text-xs text-muted-foreground">Convites, entradas, pausas, mudanças de permissão e remoções. Só você vê. Guardamos por 12 meses e depois apagamos. Se houver denúncia ou disputa, a administração da plataforma pode consultar para apurar.</p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((e) => (
              <li key={e.id} className="text-sm border-b border-border/60 pb-2 last:border-0">
                <div>{describeStaffEvent(e)}</div>
                <div className="text-xs text-muted-foreground">{actorLabel(e.actorRole)} · {new Date(e.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
