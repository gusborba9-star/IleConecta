import { supabase } from "@/lib/supabase";
import { readGate, readCancelStatus, type AccountGate, type CancelStatus } from "@/lib/accountGateCore";
import { exportMyData } from "@/lib/support";

const clean = (e: { message?: string } | null, fallback: string) => (e?.message && !/^(fetch|network|TypeError|Failed)/i.test(e.message) ? e.message : fallback);

/** Estado da conta (null se não deu para consultar: a pessoa não fica presa por falha de leitura; o servidor continua travando as gravações). */
export async function fetchAccountGate(): Promise<AccountGate | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_account_gate");
  return error ? null : readGate(data);
}

export async function fetchCancelStatus(): Promise<CancelStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_cancel_status");
  return error ? null : readCancelStatus(data);
}

export type CancelMode = "vencimento" | "agora";
export interface CancelResult { ok: boolean; error: string; mode?: string; cancelAt?: string | null; debtCents?: number }

export async function cancelSubscription(mode: CancelMode): Promise<CancelResult> {
  if (!supabase) return { ok: false, error: "Indisponível neste modo de demonstração." };
  const { data, error } = await supabase.rpc("my_cancel_subscription", { p_mode: mode });
  if (error) return { ok: false, error: clean(error, "Não foi possível cancelar agora. Tente novamente.") };
  const r = (data ?? {}) as { mode?: string; cancel_at?: string | null; debt_cents?: number };
  return { ok: true, error: "", mode: r.mode, cancelAt: r.cancel_at ?? null, debtCents: Number(r.debt_cents) > 0 ? Number(r.debt_cents) : 0 };
}

export async function undoCancel(): Promise<string | null> {
  if (!supabase) return "Indisponível neste modo de demonstração.";
  const { error } = await supabase.rpc("my_cancel_undo");
  return error ? clean(error, "Não foi possível desfazer agora. Tente novamente.") : null;
}

/** Baixa o arquivo com os dados da própria pessoa. Devolve a mensagem de erro, ou null se deu certo. */
export async function downloadMyData(): Promise<string | null> {
  const r = await exportMyData();
  if (!r.ok) return r.error;
  const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "meus-dados-ile-conecta.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
