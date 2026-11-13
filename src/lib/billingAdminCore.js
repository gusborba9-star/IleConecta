// Painel de cobrança da administração: lê e valida a configuração antes de enviar (o banco valida de novo).
import { METHOD_LABELS } from "./platformBillingCore.js";

export const KINDS = ["plan", "extra_seat", "credit_pack", "highlight", "boost"];
export const KIND_ADMIN_LABELS = { plan: "Mensalidade do plano", extra_seat: "Acesso extra", credit_pack: "Pacote de créditos", highlight: "Destaque", boost: "Impulsionamento" };
export const METHODS = ["pix", "card", "card_recurring"];
export { METHOD_LABELS };
export const DEFAULT_TOTAL_DAYS = 30;

const int = (v) => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** Resposta do banco → formulário. Valores fora do esperado viram o padrão seguro (cobrança desligada). */
export function readConfig(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const methods = {};
  const provider = {};
  for (const k of KINDS) {
    const m = Array.isArray(o.methods?.[k]) ? o.methods[k].filter((x) => METHODS.includes(x)) : [];
    methods[k] = m.length ? [...new Set(m)] : ["pix", "card"];
    provider[k] = typeof o.provider?.[k] === "string" && /^[a-z][a-z0-9_]{1,23}$/.test(o.provider[k]) ? o.provider[k] : "stripe";
  }
  return {
    enabled: o.enabled === true,
    noticeDays: int(o.notice_days) ?? 3,
    toleranceDays: int(o.tolerance_business_days) ?? 3,
    totalDays: int(o.total_block_days) ?? DEFAULT_TOTAL_DAYS,
    methods,
    provider,
  };
}

/** Confere o formulário. Devolve { ok:true, value } com o objeto no formato do banco, ou { ok:false, error }. */
export function buildConfig(f) {
  const n = (v) => (typeof v === "string" && /^[0-9]{1,2}$/.test(v.trim()) ? Number(v.trim()) : typeof v === "number" && Number.isInteger(v) ? v : null);
  const notice = n(f.noticeDays);
  const tol = n(f.toleranceDays);
  const total = n(f.totalDays);
  if (notice === null || notice < 1 || notice > 15) return { ok: false, error: "Avisar de 1 a 15 dias antes do vencimento." };
  if (tol === null || tol < 0 || tol > 10) return { ok: false, error: "Tolerância de 0 a 10 dias úteis." };
  if (total === null || total < 7 || total > 90) return { ok: false, error: "Bloqueio total de 7 a 90 dias depois da suspensão parcial." };
  const methods = {};
  const provider = {};
  for (const k of KINDS) {
    const m = (f.methods?.[k] ?? []).filter((x) => METHODS.includes(x));
    if (m.length === 0) return { ok: false, error: `Escolha ao menos um meio de pagamento para ${KIND_ADMIN_LABELS[k].toLowerCase()}.` };
    methods[k] = METHODS.filter((x) => m.includes(x));
    const p = f.provider?.[k];
    if (typeof p !== "string" || !/^[a-z][a-z0-9_]{1,23}$/.test(p)) return { ok: false, error: "Provedor inválido." };
    provider[k] = p;
  }
  return { ok: true, value: { enabled: f.enabled === true, notice_days: notice, tolerance_business_days: tol, total_block_days: total, provider, methods } };
}

/** Ligar a cobrança é o passo que muda a vida das casas: a tela pede confirmação só quando passa de desligada para ligada. */
export function needsEnableConfirm(before, after) {
  return before.enabled !== true && after.enabled === true;
}

export function toggleMethod(list, method) {
  const has = list.includes(method);
  const next = has ? list.filter((m) => m !== method) : [...list, method];
  return METHODS.filter((m) => next.includes(m));
}

/** Linha de fatura da administração (resposta crua → seguro). */
export function readAdminCharge(r) {
  return {
    id: String(r?.id ?? ""), houseId: String(r?.house_id ?? ""), kind: String(r?.kind ?? ""), description: r?.description ? String(r.description) : null,
    amountCents: Number.isFinite(Number(r?.amount_cents)) ? Number(r.amount_cents) : 0, dueDate: String(r?.due_date ?? ""), status: String(r?.status ?? ""),
    feeCents: r?.processor_fee_cents === null || r?.processor_fee_cents === undefined ? null : Number(r.processor_fee_cents),
  };
}

export const CANCELABLE = ["aberta", "vencida", "em_processamento"];
export const canCancel = (status) => CANCELABLE.includes(status);
