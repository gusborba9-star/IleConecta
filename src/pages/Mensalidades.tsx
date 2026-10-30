import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Card, Modal } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { dayLabel, fetchMemberships, leaveHouse, monthLabel, type Membership } from "@/lib/members";
import { formatBRL } from "@/lib/utils";

const brl = (cents: number) => formatBRL(cents / 100);

export default function Mensalidades() {
  const { currentUser, isRemoteAuth } = useApp();
  const [list, setList] = useState<Membership[] | null>(null);
  const [leaving, setLeaving] = useState<Membership | null>(null);

  const reload = useCallback(async () => setList(await fetchMemberships()), []);
  useEffect(() => {
    if (isRemoteAuth) void reload();
  }, [isRemoteAuth, reload]);

  if (!currentUser || !isRemoteAuth) return null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const leave = async () => {
    const m = leaving;
    setLeaving(null);
    if (!m) return;
    const err = await leaveHouse(m.memberId);
    if (err) toast.error(err);
    else toast.success(`Você saiu da lista de ${m.houseName}.`);
    await reload();
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6">
        <h1 className="font-display font-bold text-2xl">Minhas mensalidades</h1>
        <p className="text-sm text-muted-foreground mt-1">As casas de que você é membro, o que vence e o seu histórico.</p>
      </Card>

      {list === null && <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>}
      {list?.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Você ainda não é membro de nenhuma casa. Quando uma casa lhe enviar um convite, ele aparece aqui depois que você aceitar.
        </Card>
      )}

      {list?.map((m) => (
        <Card key={m.memberId} className="p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-bold text-lg flex-1 min-w-0 truncate">
              {m.houseSlug || m.ownerId ? <Link to={`/casa/${m.ownerId}`} className="hover:underline">{m.houseName}</Link> : m.houseName}
            </h2>
            {m.monthlyCents > 0 ? <Badge tone="primary">{brl(m.monthlyCents)} · dia {m.dueDay}</Badge> : <Badge tone="muted">Sem mensalidade</Badge>}
          </div>

          {m.dues.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {m.dues.map((d) => {
                const late = d.status === "aberta" && d.dueDate < today;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium w-16">{monthLabel(d.month)}</span>
                    <span className="flex-1 min-w-0 text-muted-foreground">{brl(d.amountCents)} · vence {dayLabel(d.dueDate)}</span>
                    {d.status === "paga" && <Badge tone="forest">Paga</Badge>}
                    {d.status === "dispensada" && <Badge tone="muted">Dispensada</Badge>}
                    {late && <Badge tone="danger">Atrasada</Badge>}
                    {d.status === "aberta" && !late && <Badge tone="gold">Em aberto</Badge>}
                  </li>
                );
              })}
            </ul>
          )}

          {m.dues.some((d) => d.status === "aberta") && (
            <p className="text-sm text-muted-foreground">
              {m.canPayApp
                ? "O pagamento pelo Ilê Conecta (Pix) chega em breve. Por enquanto, combine o pagamento direto com a casa."
                : "Combine o pagamento direto com a casa. Se pagar em mãos, a casa marca o mês como pago."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={`/mensagens`}><Button size="sm" variant="outline">Falar com a casa</Button></Link>
            <Button size="sm" variant="ghost" onClick={() => setLeaving(m)}>Sair da lista</Button>
          </div>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground px-1">A casa vê o seu nome, o vínculo, o valor e se a mensalidade está em dia. Você pode sair quando quiser; o histórico de pagamentos já feitos é mantido.</p>

      <Modal open={Boolean(leaving)} onClose={() => setLeaving(null)} title="Sair da lista?" maxWidth="max-w-sm">
        <p className="text-sm text-muted-foreground">Você deixa de ser membro de {leaving?.houseName} e as mensalidades em aberto são apagadas. A casa será avisada.</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setLeaving(null)}>Cancelar</Button>
          <Button onClick={() => void leave()}>Sair</Button>
        </div>
      </Modal>
    </div>
  );
}
