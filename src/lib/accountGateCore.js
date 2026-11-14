// Estado da conta da casa (tela única de conta bloqueada/inativa) e cancelamento da assinatura: leitura defensiva do que o banco devolve e textos.
// O banco decide (my_account_gate, my_cancel_status); aqui só se lê e se escreve em português.

/** Estado da conta: "ok" (usa o app), "bloqueada" (falta de pagamento, bloqueio total) ou "inativa" (assinatura cancelada/reembolsada). */
export function readGate(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const state = r.state === "bloqueada" || r.state === "inativa" ? r.state : "ok";
  if (state === "ok") return { state, role: null, houseId: null, houseName: "", debtCents: 0 };
  return { state, role: r.role === "equipe" ? "equipe" : "dono", houseId: typeof r.house_id === "string" ? r.house_id : null, houseName: typeof r.house_name === "string" ? r.house_name : "", debtCents: cents(r.debt_cents) };
}

/** Centavos inteiros e não negativos (qualquer outra coisa vira 0). */
function cents(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** 29990 -> "R$ 299,90" */
export function brMoney(c) {
  const n = cents(c);
  return `R$ ${Math.floor(n / 100)},${String(n % 100).padStart(2, "0")}`;
}

/** Texto da tela única. A casa bloqueada paga a pendência; a inativa escolhe um plano. A equipe só é avisada. */
export function lockCopy(gate) {
  const name = gate.houseName ? ` “${gate.houseName}”` : "";
  if (gate.state === "inativa") {
    if (gate.role !== "equipe" && gate.debtCents > 0) {
      return { title: "Conta inativa", lead: `A assinatura da casa${name} foi encerrada e há uma fatura vencida de ${brMoney(gate.debtCents)}. Pague a fatura para poder reativar a conta. Depois, escolha um plano e a casa volta na hora.`, action: "quitar" };
    }
    return gate.role === "equipe"
      ? { title: "Conta inativa", lead: `A casa${name} está inativa. Peça ao responsável pela casa para reativar a conta.`, action: null }
      : { title: "Conta inativa", lead: `A assinatura da casa${name} foi encerrada. Seus dados estão guardados. Para voltar, escolha um plano e pague: a casa volta na hora.`, action: "reativar" };
  }
  return gate.role === "equipe"
    ? { title: "Conta bloqueada", lead: `A casa${name} está bloqueada por falta de pagamento. Avise o responsável pela casa.`, action: null }
    : { title: "Conta bloqueada", lead: `A casa${name} está bloqueada por falta de pagamento. Pague a pendência para desbloquear: tudo volta na hora.`, action: "desbloquear" };
}

/** my_cancel_status */
export function readCancelStatus(raw) {
  const r = raw && typeof raw === "object" ? raw : null;
  if (!r || r.has_house !== true) return null;
  return {
    canCancel: r.can_cancel === true,
    reason: typeof r.reason === "string" && r.reason ? r.reason : null,
    scheduled: r.scheduled === true,
    cancelAt: typeof r.cancel_at === "string" ? r.cancel_at : null,
    nextRenewal: typeof r.next_renewal === "string" ? r.next_renewal : null,
    debtCents: cents(r.debt_cents),
  };
}

/** "2026-11-19" -> "19/11/2026" (sem fuso: a data é do calendário de Brasília). */
export function brDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Texto das duas escolhas do cancelamento. */
export function cancelChoices(status) {
  const when = status?.nextRenewal ? brDate(status.nextRenewal) : "";
  return [
    { mode: "vencimento", title: "Usar até o vencimento", text: when ? `Você usa a plataforma até ${when}. Nesse dia a casa fica inativa e nenhuma nova cobrança é feita. Até lá, você pode desfazer.` : "Você usa a plataforma até o próximo vencimento. Nesse dia a casa fica inativa e nenhuma nova cobrança é feita. Até lá, você pode desfazer." },
    { mode: "agora", title: "Cancelar agora", text: "A casa fica inativa na hora, sem devolução dos dias restantes do período já pago. Seus dados ficam guardados e você pode voltar pagando um plano." },
  ];
}

/** Aviso de dívida mostrado antes de confirmar o cancelamento (vazio quando não há fatura vencida). */
export function cancelDebtNote(status) {
  const d = cents(status?.debtCents);
  return d > 0 ? `Atenção: a fatura vencida de ${brMoney(d)} não some com o cancelamento. Ela continua em aberto e precisa ser paga para reativar a conta.` : "";
}

/** Confirmação extra de "Cancelar agora" (a casa abre mão de um período já pago). */
export const CANCEL_NOW_CONFIRM = "Tem certeza que deseja cancelar imediatamente? Ao confirmar, o perfil da casa será desativado na hora e não haverá reembolso dos dias restantes do ciclo já pago.";

/** Mensagem de sucesso depois de cancelar. */
export function cancelDoneText(res) {
  const base = res?.mode === "vencimento" && res?.cancelAt ? `Cancelamento agendado para ${brDate(res.cancelAt)}.` : "Assinatura cancelada. A casa está inativa.";
  const d = cents(res?.debtCents);
  return d > 0 ? `${base} A fatura vencida de ${brMoney(d)} continua em aberto.` : base;
}

/** Rotas que seguem abertas para a casa bloqueada/inativa: suporte (chat da Conecta e chamados), Termos e o retorno do pagamento. */
export function isLockedOpenPath(pathname) {
  return /^\/(suporte|termos|pagamento)(\/|$)/.test(String(pathname ?? ""));
}
