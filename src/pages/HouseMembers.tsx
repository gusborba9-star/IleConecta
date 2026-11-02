import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Link2, Pencil, Plus, Settings2, Trash2, UserCheck, Users } from "lucide-react";
import { Badge, Button, Card, Label, Modal } from "@/components/base";
import MoneyInput from "@/components/base/MoneyInput";
import InviteModal from "@/components/members/InviteModal";
import MemberForm from "@/components/members/MemberForm";
import { useApp } from "@/contexts/AppContext";
import { centsToMasked, maskedToCents } from "@/lib/moneyMask";
import {
  addMember, dayLabel, fetchMemberDefaults, fetchMembersOverview, markDuePaid, monthLabel, reopenDue, removeMember, setMemberDefaults, updateMember, waiveDue,
  type HouseMember, type MemberDue, type MembersOverview, type MemberSituation,
} from "@/lib/members";
import { formatBRL } from "@/lib/utils";

const SITUATION: Record<MemberSituation, { label: string; tone: "danger" | "gold" | "forest" | "muted"; name: string }> = {
  vencida: { label: "Em atraso", tone: "danger", name: "text-[hsl(var(--danger))]" },
  perto: { label: "Vence em breve", tone: "gold", name: "text-gold-ink" },
  em_dia: { label: "Em dia", tone: "forest", name: "" },
  sem_mensalidade: { label: "Sem mensalidade", tone: "muted", name: "" },
};

const brl = (cents: number) => formatBRL(cents / 100);

export default function HouseMembers() {
  const { currentUser, isRemoteAuth } = useApp();
  const [data, setData] = useState<MembersOverview | null>(null);
  const [defaults, setDefaults] = useState({ cents: 0, dueDay: 10 });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; member: HouseMember | null }>({ open: false, member: null });
  const [invite, setInvite] = useState<{ open: boolean; member?: HouseMember }>({ open: false });
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [removing, setRemoving] = useState<HouseMember | null>(null);
  const [filter, setFilter] = useState<MemberSituation | "todos">("todos");

  const reload = useCallback(async () => {
    const [o, d] = await Promise.all([fetchMembersOverview(), fetchMemberDefaults()]);
    setData(o);
    setDefaults(d);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!currentUser || currentUser.type !== "commercial" || !isRemoteAuth) {
    return (
      <Card className="p-6">
        <h1 className="font-display font-bold text-2xl">Membros</h1>
        <p className="text-sm text-muted-foreground mt-1">Esta área é da conta de uma casa.</p>
      </Card>
    );
  }

  const act = async (fn: () => Promise<string | null>, ok: string) => {
    const err = await fn();
    if (err) toast.error(err);
    else toast.success(ok);
    await reload();
  };

  const shown = (data?.members ?? []).filter((m) => filter === "todos" || m.situation === filter);
  const s = data?.summary;

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="page-hero p-6">
        <div className="space-y-4">
          <div>
            <h1 className="font-display font-bold text-2xl flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Membros da casa</h1>
            <p className="text-sm text-muted-foreground mt-1">Filhos de santo e adeptos, mensalidades e quem está perto de vencer. Só a sua casa vê esta lista.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setForm({ open: true, member: null })}><Plus className="h-4 w-4" /> Adicionar</Button>
            <Button variant="outline" onClick={() => setInvite({ open: true })}><Link2 className="h-4 w-4" /> Convite</Button>
            <Button variant="ghost" onClick={() => setDefaultsOpen(true)} aria-label="Valor e dia padrão"><Settings2 className="h-4 w-4" /> Padrões</Button>
          </div>
        </div>

        {s && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Counter label="Membros" value={s.total} active={filter === "todos"} onClick={() => setFilter("todos")} />
            <Counter label="Em atraso" value={s.vencidas} tone="danger" active={filter === "vencida"} onClick={() => setFilter(filter === "vencida" ? "todos" : "vencida")} />
            <Counter label="Vencem em breve" value={s.perto} tone="gold" active={filter === "perto"} onClick={() => setFilter(filter === "perto" ? "todos" : "perto")} />
            <Counter label="Em dia" value={s.emDia} tone="forest" active={filter === "em_dia"} onClick={() => setFilter(filter === "em_dia" ? "todos" : "em_dia")} />
          </div>
        )}
        {s && s.atrasadoCents > 0 && <p className="text-sm mt-3">Total em atraso: <strong className="text-[hsl(var(--danger))]">{brl(s.atrasadoCents)}</strong></p>}
      </Card>

      {!data && <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>}

      {data && data.members.length === 0 && (
        <Card className="p-8 text-center space-y-3">
          <Users className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-semibold">Ainda não há membros na lista.</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Adicione à mão ou mande o link de convite: quem aceitar entra sozinho, com o valor e o dia que você definir como padrão.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => setForm({ open: true, member: null })}>Adicionar membro</Button>
            <Button variant="outline" onClick={() => setInvite({ open: true })}>Gerar convite</Button>
          </div>
        </Card>
      )}

      {data && data.members.length > 0 && shown.length === 0 && <Card className="p-5 text-sm text-muted-foreground">Ninguém nesta situação agora.</Card>}

      <div className="space-y-2">
        {shown.map((m) => {
          const st = SITUATION[m.situation];
          const expanded = open === m.id;
          return (
            <Card key={m.id} className="p-0 overflow-hidden">
              <button type="button" onClick={() => setOpen(expanded ? null : m.id)} aria-expanded={expanded} className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/50 transition">
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold truncate ${st.name}`}>{m.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[m.bond, m.monthlyCents ? `${brl(m.monthlyCents)} · dia ${m.dueDay}` : null].filter(Boolean).join(" · ") || "Sem vínculo informado"}
                  </div>
                </div>
                {m.situation === "vencida" && <span className="text-xs font-semibold text-[hsl(var(--danger))] whitespace-nowrap">{m.lateCount} {m.lateCount === 1 ? "mês" : "meses"} · {brl(m.lateCents)}</span>}
                <Badge tone={st.tone}>{st.label}</Badge>
                {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </button>

              {expanded && (
                <div className="border-t border-border p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {m.hasAccount ? <Badge tone="forest"><UserCheck className="h-3 w-3" /> Tem conta no Ilê Conecta</Badge> : <Badge tone="muted">Cadastrado à mão</Badge>}
                  </div>
                  {m.note && <p className="text-sm rounded-lg bg-muted/60 p-3"><span className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Anotação reservada</span>{m.note}</p>}

                  {m.dues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma mensalidade ainda.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {m.dues.map((d) => (
                        <DueRow key={d.id} due={d}
                          onPaid={() => void act(() => markDuePaid(d.id), "Mensalidade marcada como paga.")}
                          onWaive={() => void act(() => waiveDue(d.id), "Mensalidade dispensada.")}
                          onReopen={() => void act(() => reopenDue(d.id), "Mensalidade reaberta.")} />
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setForm({ open: true, member: m })}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                    {!m.hasAccount && <Button size="sm" variant="outline" onClick={() => setInvite({ open: true, member: m })}><Link2 className="h-3.5 w-3.5" /> Convite só dele(a)</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}><Trash2 className="h-3.5 w-3.5" /> Remover</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Pagou em mãos? Abra o membro e marque o mês como pago. Quem tem conta recebe avisos antes do vencimento e pode pagar pelo Ilê Conecta (Pix, com recibo e histórico). Reembolsos e combinados ficam entre a casa e o membro. <Link to="/sobre/termos-da-casa" className="underline">Termos</Link>
      </p>

      <MemberForm
        open={form.open} onClose={() => setForm({ open: false, member: null })} initial={form.member} defaults={defaults}
        onSubmit={async (v) => {
          const err = form.member ? await updateMember(form.member.id, v) : await addMember(v);
          if (!err) await reload();
          return err;
        }}
      />
      <InviteModal open={invite.open} onClose={() => { setInvite({ open: false }); void reload(); }} memberId={invite.member?.id} memberName={invite.member?.name} />
      <DefaultsModal open={defaultsOpen} onClose={() => setDefaultsOpen(false)} initial={defaults} onSaved={reload} />

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title="Remover da lista?" maxWidth="max-w-sm">
        <p className="text-sm text-muted-foreground">
          {removing?.name} sai da lista, as mensalidades em aberto são apagadas e a anotação reservada é descartada. O que já foi pago continua no histórico. {removing?.hasAccount ? "A pessoa será avisada." : ""}
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button>
          <Button onClick={async () => { const m = removing; setRemoving(null); if (m) { setOpen(null); await act(() => removeMember(m.id), "Membro removido."); } }}>Remover</Button>
        </div>
      </Modal>
    </div>
  );
}

function Counter({ label, value, tone, active, onClick }: { label: string; value: number; tone?: "danger" | "gold" | "forest"; active: boolean; onClick: () => void }) {
  const color = tone === "danger" ? "text-[hsl(var(--danger))]" : tone === "gold" ? "text-gold-ink" : tone === "forest" ? "text-forest" : "";
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
      <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

function DueRow({ due, onPaid, onWaive, onReopen }: { due: MemberDue; onPaid: () => void; onWaive: () => void; onReopen: () => void }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const late = due.status === "aberta" && due.dueDate < today;
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="font-medium w-16">{monthLabel(due.month)}</span>
      <span className="flex-1 min-w-0 text-muted-foreground">{brl(due.amountCents)} · vence {dayLabel(due.dueDate)}</span>
      {due.status === "paga" && <Badge tone="forest">Paga {due.paidVia === "app" ? "pelo app" : "em mãos"}</Badge>}
      {due.status === "dispensada" && <Badge tone="muted">Dispensada</Badge>}
      {late && <Badge tone="danger">Atrasada</Badge>}
      {due.status === "aberta" && (
        <>
          <Button size="sm" onClick={onPaid}>Paga em mãos</Button>
          <Button size="sm" variant="ghost" onClick={onWaive}>Dispensar</Button>
        </>
      )}
      {(due.status === "dispensada" || (due.status === "paga" && due.paidVia === "manual")) && <Button size="sm" variant="ghost" onClick={onReopen}>Desfazer</Button>}
    </li>
  );
}

function DefaultsModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: { cents: number; dueDay: number }; onSaved: () => Promise<void> }) {
  const [money, setMoney] = useState("");
  const [day, setDay] = useState(10);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setMoney(centsToMasked(initial.cents || null));
    setDay(initial.dueDay);
    setError(null);
  }, [open, initial]);

  const save = async () => {
    const cents = money.trim() ? maskedToCents(money) : 0;
    if (cents === null || (cents !== 0 && (cents < 100 || cents > 1000000))) return setError("Valor inválido. Use de R$ 1,00 a R$ 10.000,00.");
    const err = await setMemberDefaults(cents, day);
    if (err) return setError(err);
    toast.success("Padrões salvos.");
    await onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Valor e dia padrão" maxWidth="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Usados nos cadastros novos e em quem entra pelo link de convite. Quem já está na lista não muda.</p>
        <div>
          <Label htmlFor="df-money">Mensalidade padrão (R$)</Label>
          <MoneyInput id="df-money" value={money} onValueChange={setMoney} placeholder="100,00" />
        </div>
        <div>
          <Label htmlFor="df-day">Vence todo dia</Label>
          <select id="df-day" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-[hsl(var(--danger))]" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}
