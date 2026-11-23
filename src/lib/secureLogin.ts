import { supabase } from "@/lib/supabase";
import { deviceLabel, lockMessage, LOGIN_ERRORS, newDeviceId } from "@/lib/secureLoginCore.js";

const KEY = "ic_device";

/** Id do aparelho (guardado só neste navegador). Se o navegador não guarda, devolve um id novo a cada vez. */
function deviceId(): string {
  const make = () => newDeviceId((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  try {
    const cur = localStorage.getItem(KEY);
    if (cur && /^[A-Za-z0-9_-]{32,128}$/.test(cur)) return cur;
    const id = make();
    localStorage.setItem(KEY, id);
    return id;
  } catch { return make(); }
}

export type SecureLoginResult = { ok: true } | { ok: false; error: string };

/** Entra pelo servidor (que aplica o bloqueio por tentativas) e instala a sessão. Se o servidor não responde, NÃO entra por fora. */
export async function secureLogin(email: string, password: string): Promise<SecureLoginResult> {
  if (!supabase) return { ok: false, error: "Servidor indisponível." };
  const { data, error } = await supabase.functions.invoke("account-recovery", {
    body: { action: "login", email: email.trim().toLowerCase(), password, device_id: deviceId(), label: deviceLabel(navigator.userAgent) },
  });
  let payload = data as Record<string, unknown> | null;
  if (error) {
    const ctx = (error as { context?: Response }).context;
    try { payload = ctx ? await ctx.json() : null; } catch { payload = null; }
    if (!payload) return { ok: false, error: LOGIN_ERRORS.indisponivel };
  }
  if (payload?.error === "bloqueada") return { ok: false, error: lockMessage(String(payload.until ?? ""), Boolean(payload.needs_email)) };
  if (payload?.error) return { ok: false, error: (LOGIN_ERRORS as Record<string, string>)[String(payload.error)] ?? LOGIN_ERRORS.indisponivel };
  const at = typeof payload?.access_token === "string" ? payload.access_token : "";
  const rt = typeof payload?.refresh_token === "string" ? payload.refresh_token : "";
  if (!at || !rt) return { ok: false, error: LOGIN_ERRORS.indisponivel };
  const { error: se } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
  return se ? { ok: false, error: LOGIN_ERRORS.indisponivel } : { ok: true };
}
