import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input, Label } from "@/components/base";
import { NOTICE_TEMPLATES, fetchReturningAccounts, fetchReturningHistory, sendReturningNotice, type NoticeKey, type ReturningAccount, type ReturningHistory } from "@/lib/returningAccounts";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const money = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Contas que voltaram com o e-mail de uma conta excluída: marcadas, com histórico retido (motivo obrigatório, fica registrado) e aviso pela plataforma. */
export default function ReturningAccountsCard() {
  const [rows, setRows] = useState<ReturningAccount[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<ReturningHistory | null>(null);
  const [template, setTemplate] = useState<NoticeKey>("reembolso_usado");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setRows(await fetchReturningAccounts()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const choose = (id: string) => {
    setOpen(open === id ? null : id);
    setHistory(null);
    setReason("");
    setNote("");
  };

  const consult = async (a: ReturningAccount) => {
    setBusy(true);
    const r = await fetchReturningHistory(a.userId, reason);
    setBusy(false);
    if (typeof r === "string") return void toast.error(r);
    setHistory(r);
  };

  const notify = async (a: ReturningAccount) => {
    setBusy(true);
    const err = await sendReturningNotice(a.userId, template, note, reason);
    setBusy(false);
    if (err) return void toast.error(err);
    toast.success(`Aviso enviado para ${a.name || "a conta"}.`);
    setNote("");
  };

  const tpl = NOTICE_TEMPLATES.find((t) => t.key === template);

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Contas que voltaram após exclusão</h2>
      <p className="text-xs text-muted-foreground">
        O e-mail destas contas já pertenceu a uma conta excluída. Elas não são impedidas de usar a plataforma; o reembolso de 7 dias não vale de novo se já foi usado antes.
        Consultar o histórico exige motivo e fica registrado com o seu nome. Os avisos usam texto neutro: o e-mail pode ter sido reaproveitado por outra pessoa.
      </p>
      {rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta reutilizada até agora.</p>}
      <ul className="space-y-2">
        {rows?.map((a) => (
          <li key={a.userId} className="rounded-xl border border-border p-3 space-y-2">
            <button type="button" className="w-full text-left" onClick={() => choose(a.userId)} aria-expanded={open === a.userId}>
              <p className="text-sm font-medium">
                {a.name || "Sem nome"} <span className="text-xs text-muted-foreground">· {a.accountType === "casa" ? "Casa" : "Cliente"} · {a.emailMasked}</span>
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Voltou após exclusão</span>
                {a.refundUsed && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Reembolso já usado</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                Cadastro em {day(a.joinedAt)} · conta anterior excluída em {day(a.lastDeletedAt)} · {a.priorCount} {a.priorCount === 1 ? "conta anterior" : "contas anteriores"} · {a.priorCharges} cobranças registradas
                {a.houses.length > 0 ? ` · ${a.houses.join(", ")}` : ""}
              </p>
            </button>
            {open === a.userId && (
              <div className="space-y-3 border-t border-border pt-3">
                <div>
                  <Label htmlFor={`rs-${a.userId}`}>Motivo (obrigatório; fica registrado)</Label>
                  <Input id={`rs-${a.userId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: apurar pedido de reembolso de 7 dias" maxLength={300} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" disabled={busy || reason.trim().length < 10} onClick={() => void consult(a)}>Ver histórico da conta anterior</Button>
                </div>
                {history && (
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
                    {history.identidades.map((i, k) => (
                      <p key={k}><strong>{i.nome ?? "Sem nome"}</strong> ({i.tipo ?? "—"}) · casas: {i.casas.join(", ") || "—"} · excluída em {day(i.excluida_em)} · guardado até {day(i.guardada_ate)}</p>
                    ))}
                    <div>
                      <p className="font-semibold">Cobranças da plataforma</p>
                      {history.cobrancas.length === 0 ? <p>Nenhuma.</p> : <ul className="list-disc pl-4">{history.cobrancas.map((c, k) => <li key={k}>{c.tipo} · {money(c.valor_cents)} · {c.status} · venc. {day(c.vencimento)}{c.paga_em ? ` · paga em ${day(c.paga_em)}` : ""}</li>)}</ul>}
                    </div>
                    <div>
                      <p className="font-semibold">Reembolsos do plano</p>
                      {history.reembolsos_do_plano.length === 0 ? <p>Nenhum.</p> : <ul className="list-disc pl-4">{history.reembolsos_do_plano.map((r, k) => <li key={k}>{money(r.valor_cents)} · {r.status} · {day(r.em)}</li>)}</ul>}
                    </div>
                    <div>
                      <p className="font-semibold">Chamados</p>
                      {history.chamados.length === 0 ? <p>Nenhum.</p> : <ul className="list-disc pl-4">{history.chamados.map((c, k) => <li key={k}>{c.tipo} · {c.status} · {day(c.aberto_em)}</li>)}</ul>}
                    </div>
                    <p className="text-muted-foreground">Aceites guardados: {history.aceites.length}. Conteúdo pessoal (mensagens, publicações) foi apagado na exclusão.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor={`tp-${a.userId}`}>Aviso pela plataforma</Label>
                  <select id={`tp-${a.userId}`} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={template} onChange={(e) => setTemplate(e.target.value as NoticeKey)}>
                    {NOTICE_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  {tpl?.preview && <p className="rounded-lg bg-muted/40 p-2 text-xs">{tpl.preview}</p>}
                  <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={template === "livre" ? "Escreva o aviso (20 a 300 caracteres)" : "Observação opcional (até 300 caracteres)"} aria-label="Texto do aviso" />
                  <Button size="sm" disabled={busy || reason.trim().length < 10 || (template === "livre" && note.trim().length < 20)} onClick={() => void notify(a)}>Enviar aviso</Button>
                  {reason.trim().length < 10 && <p className="text-[11px] text-muted-foreground">Preencha o motivo para liberar os botões.</p>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
